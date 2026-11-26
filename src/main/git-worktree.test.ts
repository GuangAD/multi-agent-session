// worktree 能力层测试(T2「测试规格」六组用例)
// 期望值来源:契约用例表的期望列 + 本机 `git worktree list --porcelain` 实测输出形状
// (worktree/HEAD/branch/detached 行 + 空行分隔)+ 手算字面量;
// 服务组用假执行器记录入参,不打真实 git。
import { describe, expect, it } from 'vitest'
import {
  buildExcludeContent,
  createWorktreeService,
  decideCreateConflict,
  parseWorktreeList,
  validateWorktreeName
} from './git-worktree'

describe('名称(validateWorktreeName)', () => {
  it('含空格:返回原因,不放行', () => {
    expect(validateWorktreeName('feat a')).not.toBeNull()
  })

  it('以 ~ 开头:返回原因(git check-ref-format 禁止的字符)', () => {
    expect(validateWorktreeName('~feat')).not.toBeNull()
  })

  it('feat-a:合法,null', () => {
    expect(validateWorktreeName('feat-a')).toBeNull()
  })

  // 守卫用例(T2 评审 Minor-1):这两类名字 git 一定拒,必须在拼命令之前挡住,
  // 否则用户看到的是 git-error 原文而不是 name-invalid(覆盖标准 1 的意图是零 git 调用)
  it('含连续斜杠 feat//a:返回原因(git check-ref-format 禁止)', () => {
    expect(validateWorktreeName('feat//a')).not.toBeNull()
  })

  it('以 .lock 结尾 feat.lock:返回原因(git 禁止 ref 以 .lock 结尾)', () => {
    expect(validateWorktreeName('feat.lock')).not.toBeNull()
  })

  // git 的规则是逐段(slash-separated component)判的,不是整名判(T2 复审 P2-3):
  // 任一段以 . 开头或以 .lock 结尾都不合法,必须在本地挡住而不是交给 git 报错
  it('某段以点开头 feat/.hidden:返回原因', () => {
    expect(validateWorktreeName('feat/.hidden')).not.toBeNull()
  })

  it('某段以 .lock 结尾 feat.lock/sub:返回原因', () => {
    expect(validateWorktreeName('feat.lock/sub')).not.toBeNull()
  })
})

describe('排除文件(buildExcludeContent)', () => {
  it('空串:末尾多一行 .worktree/', () => {
    expect(buildExcludeContent('')).toBe('.worktree/\n')
  })

  it('已含 .worktree/ 一行:原样返回(幂等)', () => {
    const existing = '# git ls-files --others --exclude-from=.git/info/exclude\n*.log\n.worktree/\n'
    expect(buildExcludeContent(existing)).toBe(existing)
  })

  it('含其他行:保留原行并追加', () => {
    expect(buildExcludeContent('*.log\n')).toBe('*.log\n.worktree/\n')
  })

  it('末尾无换行:追加后不粘行', () => {
    expect(buildExcludeContent('*.log')).toBe('*.log\n.worktree/\n')
  })
})

// porcelain 输出形状来自本机实测(`git worktree list --porcelain`):每条以 `worktree <路径>` 开头,
// 后续 HEAD 行、branch 行(detached 条目无 branch 行),条目间以空行分隔。
describe('worktree 列表(parseWorktreeList)', () => {
  it('两条常规条目:路径与分支正确', () => {
    const raw = [
      'worktree D:/demo',
      'HEAD ef9444da9ee8dbcbfd2df4b7b36829dcc9d83219',
      'branch refs/heads/main',
      '',
      'worktree D:/demo/.worktree/feat-a',
      'HEAD ef9444da9ee8dbcbfd2df4b7b36829dcc9d83219',
      'branch refs/heads/feat-a',
      ''
    ].join('\n')

    expect(parseWorktreeList(raw)).toEqual([
      { path: 'D:/demo', branch: 'main' },
      { path: 'D:/demo/.worktree/feat-a', branch: 'feat-a' }
    ])
  })

  it('detached 条目(无 branch 行):branch 为空串', () => {
    const raw = [
      'worktree C:/probe',
      'HEAD d9aaac59ffdc569da1efd93578be218d452b236e',
      'branch refs/heads/master',
      '',
      'worktree C:/probe-det',
      'HEAD d9aaac59ffdc569da1efd93578be218d452b236e',
      'detached',
      ''
    ].join('\n')

    expect(parseWorktreeList(raw)).toEqual([
      { path: 'C:/probe', branch: 'master' },
      { path: 'C:/probe-det', branch: '' }
    ])
  })

  it('空串:空数组', () => {
    expect(parseWorktreeList('')).toEqual([])
  })
})

// 事实描述:targetPath 是应用要建的目录(path.join 在 Windows 上给反斜杠),而 git 登记的路径
// 是本机实测的正斜杠形式(`worktree D:/demo/.worktree/feat-a`),两边必须归一后再比。
describe('冲突(decideCreateConflict)', () => {
  const targetPath = 'D:\\demo\\.worktree\\feat-a'

  it('目录已存在:dir-exists', () => {
    expect(
      decideCreateConflict({
        targetPath,
        dirExists: true,
        registeredPaths: [],
        sessionPaths: []
      })
    ).toBe('dir-exists')
  })

  it('目录不存在、路径已登记:path-registered', () => {
    expect(
      decideCreateConflict({
        targetPath,
        dirExists: false,
        registeredPaths: ['D:/demo/.worktree/feat-a'],
        sessionPaths: []
      })
    ).toBe('path-registered')
  })

  it('已有会话指向同路径:session-taken', () => {
    expect(
      decideCreateConflict({
        targetPath,
        dirExists: false,
        registeredPaths: ['D:/demo/.worktree/feat-b'],
        sessionPaths: ['D:/demo/.worktree/feat-a']
      })
    ).toBe('session-taken')
  })

  it('三者都不命中:null', () => {
    expect(
      decideCreateConflict({
        targetPath,
        dirExists: false,
        registeredPaths: ['D:/demo'],
        sessionPaths: ['D:/demo/.worktree/feat-b']
      })
    ).toBeNull()
  })
})

// 假执行器记录收到的 (root, args),不打真实 git:期望值取自 git 文档的参数顺序
// `git worktree add [-b <new-branch>] <path> <commit-ish>`。
describe('服务(createWorktreeService)', () => {
  it('add:runner 收到 root 与 worktree add -b 参数', async () => {
    const calls: Array<{ root: string; args: string[] }> = []
    const service = createWorktreeService(async (root, args) => {
      calls.push({ root, args })
      return ''
    })

    await service.add({
      root: 'D:/demo',
      path: 'D:/demo/.worktree/feat-a',
      branch: 'feat-a',
      base: 'main'
    })

    expect(calls).toEqual([
      {
        root: 'D:/demo',
        args: ['worktree', 'add', '-b', 'feat-a', 'D:/demo/.worktree/feat-a', 'main']
      }
    ])
  })

  it('add:git 报错原样抛出,不吞', async () => {
    const gitError = new Error("fatal: 'D:/demo/.worktree/feat-a' already exists")
    const service = createWorktreeService(async () => {
      throw gitError
    })

    await expect(
      service.add({
        root: 'D:/demo',
        path: 'D:/demo/.worktree/feat-a',
        branch: 'feat-a',
        base: 'main'
      })
    ).rejects.toThrow(gitError.message)
  })

  // isRepoRoot 是 T2 编排层唯一的仓库边界判据(评审 Important-1 的 gate 依赖它),
  // 期望值来源:git rev-parse --show-toplevel 的语义(回仓库根,不可能回子目录)
  it('isRepoRoot:show-toplevel 回本项目目录 → true', async () => {
    const service = createWorktreeService(async () => 'D:/demo\n')
    expect(await service.isRepoRoot('D:/demo')).toBe(true)
  })

  it('isRepoRoot:项目目录只是上级仓库的子目录 → false', async () => {
    const service = createWorktreeService(async () => 'D:/demo\n')
    expect(await service.isRepoRoot('D:/demo/sub')).toBe(false)
  })

  it('isRepoRoot:探测抛错(不是 git 仓库/不可访问)→ false,不抛', async () => {
    const service = createWorktreeService(async () => {
      throw new Error('fatal: not a git repository')
    })
    expect(await service.isRepoRoot('D:/demo')).toBe(false)
  })
})
