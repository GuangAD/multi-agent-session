// worktree 能力层(T2):名称校验、排除文件幂等追加、porcelain 解析、建前冲突判定四个纯函数,
// 外加一个把 worktree 的 git 调用收在一处的服务(spec 模块划分:src/main/git-worktree.ts)。
// git 命令一律拼成参数数组交注入的执行器(GitRunner),生产实现走 git-service 的 GitRepo.raw。
// Why 注入执行器:这些规则要在单测里钉死,不打真实 git、不依赖机器 git 版本。
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

// 排除文件里写的就是这一行:worktree 目录整体不入库(不碰用户的 .gitignore)
const EXCLUDE_LINE = '.worktree/'

// 幂等追加:已含该行则原样返回(可重复调用),否则保证追加在前一行之后,不与残行粘连。
// 行比较取 trim 后的值——gitignore 语义里行尾空白不参与匹配,带空白也算已含。
export function buildExcludeContent(existing: string): string {
  const lines = existing.split(/\r?\n/)
  if (lines.some((line) => line.trim() === EXCLUDE_LINE)) {
    return existing
  }
  if (existing === '') {
    return `${EXCLUDE_LINE}\n`
  }
  return existing.endsWith('\n') ? `${existing}${EXCLUDE_LINE}\n` : `${existing}\n${EXCLUDE_LINE}\n`
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
function dirKey(path: string): string {
  const normalized = path.replace(/\\/g, '/').replace(/\/+$/, '')
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

export interface WorktreeService {
  isRepoRoot(root: string): Promise<boolean>
  list(root: string): Promise<WorktreeRef[]>
  add(p: { root: string; path: string; branch: string; base: string }): Promise<void>
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
    }
  }
}
