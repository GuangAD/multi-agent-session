// git 服务(spec:T10 落点 src/main/git-service.ts)
// simple-git 薄封装(status/diff/stage/unstage/commit/branches/checkout,按 root 缓存句柄)+
// 两个纯函数接缝:parseStatusPorcelain(porcelain v1 状态码矩阵,完整档,落本文件)与
// parseDiffLines(unified diff 行分类,抽样档;实现落 shared/git-diff-lines.ts 并由本文件再导出
// ——渲染层着色要用同一套行分类,放 shared 避免两套规则漂移,契约落点仍由本文件可寻址)。
// Why 自家解析 porcelain 而不吃 simple-git 的结构化 StatusResult:状态码矩阵是用户「对哪个文件
// 做数据操作」的唯一依据,必须有单测钉住的接缝(spec 覆盖标准);simple-git 的结构化结果把
// X/Y 两列压成数组,重建矩阵反而更绕。
// 不做 push/pull/rebase 等远端操作(brief 非目标)。
import { simpleGit, type SimpleGit } from 'simple-git'
import type { GitStatus } from '../shared/ipc-contract'

// 接缝再导出:实现见 shared/git-diff-lines.ts(纯函数、渲染层复用),本文件保持契约落点
export { parseDiffLines } from '../shared/git-diff-lines'
export type { DiffLine } from '../shared/git-diff-lines'

// porcelain 的 X/Y 状态字符:' ' 未变更;M/T/A/D/R/C/U 各状态;'?' 未跟踪;'!' 被忽略
const UNTRACKED_MARK = '?'
const IGNORED_X = '!'

// 空仓库(unborn HEAD)的分支头前缀:`## No commits yet on main`(git ≥2.10 形态)
// Why 必须剥:`...` 切分对它不生效,不剥会把整句当分支名灌进分支下拉(T10 评审 Important-1)
const UNBORN_PREFIX = 'No commits yet on '

// 分支头:`main...origin/main [ahead 1]` / `main` / `HEAD (no branch)` / `No commits yet on main`
// 手算:先剥 unborn 前缀,再切 upstream(`...` 之前),再切状态(` [ahead 1]` 之前),剩下的即分支名
function parseBranchHeader(header: string): string {
  const withoutUnborn = header.startsWith(UNBORN_PREFIX)
    ? header.slice(UNBORN_PREFIX.length)
    : header
  const beforeUpstream = withoutUnborn.split('...')[0] ?? withoutUnborn
  const beforeState = beforeUpstream.split(' [')[0] ?? beforeUpstream
  const name = beforeState.trim()
  // detached HEAD:porcelain 写作 `HEAD (no branch)`
  return name.startsWith('HEAD') ? 'HEAD' : name
}

// porcelain 对含特殊字符的路径加双引号并做 C 风格转义(quotePath);这里只解最常见的两种转义
// Why 不做完整 C 转义矩阵:Windows 首发且中文路径默认被 core.quotePath 转义成八进制,
// 完整解码属另一件事;引号剥离已覆盖「路径含空格」这一实际场景。
function unquotePath(path: string): string {
  if (!path.startsWith('"') || !path.endsWith('"') || path.length < 2) {
    return path
  }
  return path.slice(1, -1).replace(/\\(["\\])/g, '$1')
}

// 接缝(纯函数):解析 `git status --porcelain=v1 --branch` 原文
// 逐行:首两列 = XY(左 = 暂存区相对 HEAD,右 = 工作区相对暂存区),第三列是分隔空格,其后为路径。
// 未跟踪(`??`)归「未暂存」:staged 留空、unstaged 记 '?',让分组与「暂存」按钮语义正确。
export function parseStatusPorcelain(raw: string): GitStatus {
  const entries: GitStatus['entries'] = []
  let branch = ''

  for (const line of raw.split(/\r?\n/)) {
    if (line === '') {
      continue // 空行(空输出/尾随换行)
    }
    if (line.startsWith('## ')) {
      branch = parseBranchHeader(line.slice(3))
      continue
    }
    if (line.length < 3) {
      continue // 畸形短行:不足以容纳 XY + 分隔空格
    }
    const staged = line[0]
    const unstaged = line[1]
    if (staged === IGNORED_X && unstaged === IGNORED_X) {
      continue // `!!` 被忽略文件:不出现在变更列表
    }
    let path = line.slice(3)
    // 重命名/复制:`R  old -> new` / `C  old -> new`,条目取新路径(旧路径只作历史信息)
    const arrowIndex = path.indexOf(' -> ')
    if (arrowIndex !== -1) {
      path = path.slice(arrowIndex + ' -> '.length)
    }
    // 不 trim:porcelain 在第三列后直接给路径原文,首尾空格可能是文件名的合法部分
    path = unquotePath(path)
    if (path === '') {
      continue
    }
    if (staged === UNTRACKED_MARK && unstaged === UNTRACKED_MARK) {
      entries.push({ path, staged: ' ', unstaged: UNTRACKED_MARK })
      continue
    }
    entries.push({ path, staged, unstaged })
  }

  return { branch, entries }
}

// 仓库句柄门面:调用方只依赖这个接口,simple-git 不外泄到 IPC 层
export interface GitRepo {
  status(): Promise<GitStatus>
  diff(path?: string): Promise<string>
  stage(paths: string[]): Promise<void>
  unstage(paths: string[]): Promise<void>
  commit(message: string): Promise<string>
  branches(): Promise<{ current: string; all: string[] }>
  checkout(branch: string): Promise<void>
  // 原生命令出口:worktree 等未封装的子命令拼参数数组走这里,与上面七通道共用同一个
  // simple-git 实例与 root 缓存(spec 技术选型);失败原样抛出 git 原文
  raw(args: string[]): Promise<string>
}

// 按 root 缓存句柄:同 root 复用(spec:按项目 root 缓存 repo 句柄)
const repos = new Map<string, GitRepo>()

// HEAD 是否存在:空仓库(刚 init、从未提交)返回 false。
// Why 用 rev-parse 探而不是捕异常:异常路径要把「没有 HEAD」与「真出错」区分开,探测更直白
async function hasHead(git: SimpleGit): Promise<boolean> {
  try {
    await git.raw(['rev-parse', '--verify', 'HEAD'])
    return true
  } catch {
    return false
  }
}

function createRepo(baseDir: string): GitRepo {
  const git: SimpleGit = simpleGit({ baseDir })
  return {
    // porcelain 原文喂自家接缝(simple-git 的结构化 status 不可靠,见文件头 Why)
    async status(): Promise<GitStatus> {
      const raw = await git.raw(['status', '--porcelain=v1', '--branch'])
      return parseStatusPorcelain(raw)
    },
    // 工作区相对 HEAD 的 unified diff(含已暂存与未暂存);未跟踪的新文件此处为空,
    // 由渲染层显示「暂存后可见差异」的空态(已知边界,记入 plan 开发记录)
    async diff(path?: string): Promise<string> {
      // 空仓库(unborn HEAD)没有 HEAD 可 diff:直接返回空,避免 `fatal: ambiguous argument 'HEAD'`
      // 原文冒到界面上(T10 评审 Important-1)
      if (!(await hasHead(git))) {
        return ''
      }
      const args = path ? ['diff', 'HEAD', '--', path] : ['diff', 'HEAD']
      return git.raw(args)
    },
    async stage(paths: string[]): Promise<void> {
      if (paths.length === 0) {
        return
      }
      await git.add(paths)
    },
    // 取消暂存 = 把索引退回 HEAD(等价 `git reset HEAD -- <paths>`);
    // 空仓库没有 HEAD 可退回,改用 `git rm --cached`(把文件从索引摘掉)达到同样效果
    async unstage(paths: string[]): Promise<void> {
      if (paths.length === 0) {
        return
      }
      if (!(await hasHead(git))) {
        // -f 必需:空仓库没有 HEAD,`rm --cached` 的安全检查(索引项须与工作区或 HEAD 一致)
        // 在「暂存后又改过文件」时必然失败;--cached 下 -f 只摘索引、不动工作区文件
        // (实测:无 -f 报 "staged content different from both the file and the HEAD")
        await git.raw(['rm', '-f', '--cached', '--', ...paths])
        return
      }
      await git.raw(['reset', 'HEAD', '--', ...paths])
    },
    async commit(message: string): Promise<string> {
      const result = await git.commit(message)
      return result.commit
    },
    async branches(): Promise<{ current: string; all: string[] }> {
      const result = await git.branchLocal()
      return { current: result.current, all: result.all }
    },
    async checkout(branch: string): Promise<void> {
      await git.checkout(branch)
    },
    async raw(args: string[]): Promise<string> {
      return git.raw(args)
    }
  }
}

export const gitService = {
  // 非接缝(有状态:持有 repo 句柄,按 root 创建)
  for(root: string): GitRepo {
    const cached = repos.get(root)
    if (cached) {
      return cached
    }
    const repo = createRepo(root)
    repos.set(root, repo)
    return repo
  }
}
