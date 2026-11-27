// worktree 能力层(T2):名称校验、排除文件幂等追加、porcelain 解析、建前冲突判定四个纯函数,
// 外加一个把 worktree 的 git 调用收在一处的服务(spec 模块划分:src/main/git-worktree.ts)。
// git 命令一律拼成参数数组交注入的执行器(GitRunner),生产实现走 git-service 的 GitRepo.raw。
// Why 注入执行器:这些规则要在单测里钉死,不打真实 git、不依赖机器 git 版本。
import { resolve } from 'node:path'
import type { WorktreeFailure } from '../shared/ipc-contract'

export type GitRunner = (root: string, args: string[]) => Promise<string>

export interface WorktreeRef {
  path: string
  branch: string // bare/detached 条目为空串
}

// 名称同时是 worktree 目录名与新建的分支名,故按 git check-ref-format 的常用子集取白名单:
// 非空、只含 A-Za-z0-9._/-、不含 `..`、不以 / . - 开头或结尾(spec 技术选型)。
// Why 白名单而非黑名单:放行一个 git 或文件系统不接受的字符,就会在 `worktree add` 后才报错,
// 留下半成品目录;返回的字符串直接给用户看,说明被挡在哪一条。
const NAME_CHARS = /^[A-Za-z0-9._/-]+$/
const EDGE_CHARS = ['/', '.', '-']

export function validateWorktreeName(name: string): string | null {
  if (name === '') {
    return '名称不能为空'
  }
  if (!NAME_CHARS.test(name)) {
    return '名称只能包含字母、数字、点、下划线、斜杠与短横线'
  }
  if (name.includes('..')) {
    return '名称不能包含连续的点(..)'
  }
  // git check-ref-format 的规则是逐段判:任一段不能为空(即连续斜杠)、不能以点开头、
  // 不能以 .lock 结尾。本地挡住是为了让用户看到 name-invalid 而不是 git 原文
  for (const segment of name.split('/')) {
    if (segment === '') {
      return '名称不能包含连续的斜杠(//)'
    }
    if (segment.startsWith('.')) {
      return '名称的每一段都不能以点开头'
    }
    if (segment.endsWith('.lock')) {
      return '名称的每一段都不能以 .lock 结尾'
    }
  }
  const first = name.charAt(0)
  const last = name.charAt(name.length - 1)
  if (EDGE_CHARS.includes(first)) {
    return `名称不能以 ${first} 开头`
  }
  if (EDGE_CHARS.includes(last)) {
    return `名称不能以 ${last} 结尾`
  }
  return null
}

// 建 worktree 时要写进 .git/info/exclude 的全部条目(T6 处理 1)。
// Why 不止 .worktree/:worktree 会话让 hook 注入器把配置文件写进**运行目录**(会话运行目录 = worktree),
// 不预设排除就会以未跟踪文件的形式把该项目弄脏,git 面板满屏,`worktree remove` 也会因「有未跟踪
// 文件」拒绝。`.git/info/exclude` 是仓库级、链式 worktree 与被链仓库共享,写一次即两者共同生效。
// 四个目录来自 agent-hooks injector.ts 的 ensureProjectWithLauncher 落盘位置(claude/codex/
// antigravity/pi 各一个顶层目录)。不改用户的 .gitignore:只写仓库本机排除文件。
// 边界(如实登记):四条都**不带前导斜杠**,按 gitignore 语义在任意深度匹配,所以主工作区里用户
// 自建的同名未跟踪目录也会一起从 status 消失(`git add .` 会跳过,需 -f)。这些目录正是本应用
// hook 注入的产物(见 injector.ts),故按「应用产物不入库」处理;已跟踪文件不受影响。
// 若日后要收窄成只挡 worktree 内,可改用 `.worktree/*/.claude/` 这类锚定写法,代价是主工作区
// 重新出现这四个未跟踪目录。条目一旦写入不会回收(删掉最后一个 worktree 也留着),无副作用。
export const WORKTREE_EXCLUDE_ENTRIES: readonly string[] = [
  '.worktree/',
  '.claude/',
  '.codex/',
  '.agents/',
  '.pi/'
]

// 幂等追加多条:逐条判「原文是否已含」,缺的按给定顺序追加,已含的跳过可重复调用;
// 追加时保证落在前一行之后(原文末尾无换行则先补一个),最后一行同样带换行,不与残行粘连。
// 行比较取 trim 后的值——gitignore 语义里行尾空白不参与匹配,带空白也算已含。
export function buildExcludeContent(existing: string, entries: readonly string[]): string {
  let content = existing
  for (const entry of entries) {
    // 每条重算行集:上一条追加的条目会影响下一条的判定
    if (content.split(/\r?\n/).some((line) => line.trim() === entry)) {
      continue
    }
    if (content === '') {
      content = `${entry}\n`
    } else if (content.endsWith('\n')) {
      content = `${content}${entry}\n`
    } else {
      content = `${content}\n${entry}\n`
    }
  }
  return content
}

// porcelain 每条以 `worktree <绝对路径>` 开头,分支写在 `branch refs/heads/<名>`;detached / bare 条目
// 没有 branch 行,故 branch 留空串(建前判定只用到路径)。畸形行跳过:git 将来加字段不影响解析。
const WORKTREE_PREFIX = 'worktree '
const BRANCH_PREFIX = 'branch '
const LOCAL_BRANCH_PREFIX = 'refs/heads/'

export function parseWorktreeList(raw: string): WorktreeRef[] {
  const refs: WorktreeRef[] = []
  let current: WorktreeRef | null = null

  for (const line of raw.split(/\r?\n/)) {
    if (line.startsWith(WORKTREE_PREFIX)) {
      const path = line.slice(WORKTREE_PREFIX.length)
      current = path === '' ? null : { path, branch: '' }
      if (current) {
        refs.push(current)
      }
      continue
    }
    if (current && line.startsWith(BRANCH_PREFIX)) {
      const ref = line.slice(BRANCH_PREFIX.length)
      current.branch = ref.startsWith(LOCAL_BRANCH_PREFIX)
        ? ref.slice(LOCAL_BRANCH_PREFIX.length)
        : ref
    }
  }

  return refs
}

// 路径比较键:git 的 worktree list 在 Windows 上回正斜杠(本机实测),而应用用 path.join 得到反斜杠;
// 尾分隔符两边写法也不同,故归一后再比。Windows 路径大小写不敏感。
// Why 先 resolve:记录里的路径可能带 `..`,不解析的话 `D:/demo/.worktree/../evil` 会含 `.worktree/`
// 前缀,让「只在 .worktree/ 下才允许应用自删」的守卫放行到目录之外(T6 处理 5)。
function dirKey(path: string): string {
  // 入参约定为绝对路径(调用方都来自 store 与 git 输出);相对路径会按主进程 cwd 解析,语义不定
  const normalized = resolve(path).replace(/\\/g, '/').replace(/\/+$/, '')
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized
}

// 建前一次判掉三类冲突,优先级:目录已存在 → 路径已被 git 登记 → 已有会话占用。
// Why 目录先于登记:目录已存在时用户看到的是「那里已经有东西」,先清目录才能继续;
// 登记残留(目录被手工删但 git 仍记得)则要用户先 prune。
export function decideCreateConflict(p: {
  targetPath: string
  dirExists: boolean
  registeredPaths: string[]
  sessionPaths: string[]
}): WorktreeFailure | null {
  if (p.dirExists) {
    return 'dir-exists'
  }
  const target = dirKey(p.targetPath)
  if (p.registeredPaths.some((path) => dirKey(path) === target)) {
    return 'path-registered'
  }
  if (p.sessionPaths.some((path) => dirKey(path) === target)) {
    return 'session-taken'
  }
  return null
}

// 两件事实 → 一种清理动作(T3 处理 3)。git 对「目录没了但登记还在」的条目只认 prune,
// 反之 `worktree remove` 会报 "is not a working tree";目录与登记都在才走 remove。
export type RemovalAction = 'remove' | 'prune' | 'skip'

export function pickRemovalAction(p: { dirExists: boolean; registered: boolean }): RemovalAction {
  if (p.dirExists && p.registered) {
    return 'remove'
  }
  return p.registered ? 'prune' : 'skip'
}

// git / fs 报错原文:调用方要把 git 原文送到界面上让用户看懂是哪一步出错
function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

// 把「探事实 → 选动作 → 执行」串成一次清理(T3 处理 2-4)。不抛:任何失败都折成 ok:false 与原文,
// 让调用方能把「目录没清掉」与「记录已删」两件事分开——没清掉就一条记录也不许动。
export async function removeWorktree(p: {
  root: string
  path: string
  force: boolean
  service: WorktreeService
  dirExists: (path: string) => Promise<boolean>
  // 应用自己删目录(仅在「目录还在但 git 已不认这条登记」时用到);注入以便单测不打真实 fs
  removeDir: (path: string) => Promise<void>
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const dirExists = await p.dirExists(p.path)
  // 登记事实只能问 git。list 失败时无法判断该不该动手:目录也不在就没有孤儿可留,幂等成功
  // 让记录能被删掉(否则项目目录被用户删掉时这条会话永远删不掉);目录还在则不动手,回原文
  let registeredPaths: string[]
  try {
    registeredPaths = (await p.service.list(p.root)).map((ref) => ref.path)
  } catch (error) {
    if (!dirExists) {
      return { ok: true }
    }
    return { ok: false, error: errorMessage(error) }
  }
  const target = dirKey(p.path)
  const action = pickRemovalAction({
    dirExists,
    registered: registeredPaths.some((path) => dirKey(path) === target)
  })
  if (action === 'skip') {
    // 目录也不在了:幂等成功,记录照删
    if (!dirExists) {
      return { ok: true }
    }
    // 目录还在、git 已不认这条登记(实测可达:有进程占着目录时 `worktree remove` 会先摘掉
    // 登记再报 Permission denied)。此时跳过会让记录被删、目录永久留下,而记录是应用唯一
    // 指向它的句柄。故对「本项目 .worktree/ 下」的路径改由应用自己删,别处一律拒绝。
    const managedPrefix = `${dirKey(p.root)}/.worktree/`
    if (!dirKey(p.path).startsWith(managedPrefix)) {
      return {
        ok: false,
        error: `目录存在但 git 未登记该 worktree,且不在 ${managedPrefix} 下,拒绝自动删除`
      }
    }
    // 走到这里已无法自证目录干净(git 的登记没了,也就没有 git 的脏检查兜底),且 rm 不是原子的:
    // 冲突文件被占时会先删掉一部分再抛错。故只在用户已确认丢弃时动手(forceWorktree),否则回错误
    // 让渲染层弹二次确认——与 brief「有未提交改动先拒,二次确认才强删」同一口径。
    if (!p.force) {
      return { ok: false, error: '目录存在但 git 已不认这条 worktree,需确认丢弃目录内容后再删' }
    }
    try {
      await p.removeDir(p.path)
      return { ok: true }
    } catch (error) {
      return { ok: false, error: errorMessage(error) }
    }
  }

  try {
    if (action === 'prune') {
      await p.service.prune(p.root)
    } else {
      // 分支始终保留(ADR-0003 例外):只删应用自己建的这个 worktree 副本
      await p.service.remove({ root: p.root, path: p.path, force: p.force })
    }
    return { ok: true }
  } catch (error) {
    return { ok: false, error: errorMessage(error) }
  }
}

export interface WorktreeService {
  isRepoRoot(root: string): Promise<boolean>
  list(root: string): Promise<WorktreeRef[]>
  add(p: { root: string; path: string; branch: string; base: string }): Promise<void>
  remove(p: { root: string; path: string; force: boolean }): Promise<void>
  prune(root: string): Promise<void>
}

// 每次调用新建实例,不缓存、不持有状态(可重复创建);root 由每个动作自带,runner 据此定执行目录。
// 出错时 add 直接抛 git 原文,由编排层转成 git-error(spec 覆盖标准 11)。
export function createWorktreeService(runner: GitRunner): WorktreeService {
  return {
    // 入口只在「仓库根 == 本项目目录」时提供:排除文件固定写 <项目>/.git/info/exclude,
    // 不回溯上级。探测失败(不是仓库)= false,不向渲染层抛
    async isRepoRoot(root) {
      try {
        const topLevel = await runner(root, ['rev-parse', '--show-toplevel'])
        return dirKey(topLevel.trim()) === dirKey(root)
      } catch {
        return false
      }
    },
    async list(root) {
      return parseWorktreeList(await runner(root, ['worktree', 'list', '--porcelain']))
    },
    async add(p) {
      // 参数顺序按 git 文档:worktree add [-b <new-branch>] <path> <commit-ish>
      await runner(p.root, ['worktree', 'add', '-b', p.branch, p.path, p.base])
    },
    async remove(p) {
      // 参数顺序按 git 文档:worktree remove [--force] <path>;force 才丢弃未提交改动
      await runner(
        p.root,
        p.force ? ['worktree', 'remove', '--force', p.path] : ['worktree', 'remove', p.path]
      )
    },
    async prune(root) {
      await runner(root, ['worktree', 'prune'])
    }
  }
}
