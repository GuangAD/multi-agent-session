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
  pickRemovalAction,
  removeWorktree,
  validateWorktreeName,
  type WorktreeService
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
  // 单条目语义(既有 T2 用例):条目由调用方给,期望输出与 T2 完全一致,只是把 `.worktree/`
  // 从函数内部的常量改成入参(T6 处理 1:一次写多条)
  it('空串:末尾多一行 .worktree/', () => {
    expect(buildExcludeContent('', ['.worktree/'])).toBe('.worktree/\n')
  })

  it('已含 .worktree/ 一行:原样返回(幂等)', () => {
    const existing = '# git ls-files --others --exclude-from=.git/info/exclude\n*.log\n.worktree/\n'
    expect(buildExcludeContent(existing, ['.worktree/'])).toBe(existing)
  })

  it('含其他行:保留原行并追加', () => {
    expect(buildExcludeContent('*.log\n', ['.worktree/'])).toBe('*.log\n.worktree/\n')
  })

  it('末尾无换行:追加后不粘行', () => {
    expect(buildExcludeContent('*.log', ['.worktree/'])).toBe('*.log\n.worktree/\n')
  })

  // T6 处理 1:建 worktree 时要一次写进多条(exclude 也盖住 hook 注入的四个顶层目录),
  // 期望值 = 契约用例表第 1-3 行(逐条追加语义 + 幂等约定)
  it('多条目:原文空 → 按顺序全写,末尾只有一个换行', () => {
    expect(buildExcludeContent('', ['.worktree/', '.claude/', '.codex/'])).toBe(
      '.worktree/\n.claude/\n.codex/\n'
    )
  })

  it('多条目:已含 .worktree/ → 只补缺的两条,不重复', () => {
    expect(buildExcludeContent('.worktree/\n', ['.worktree/', '.claude/', '.codex/'])).toBe(
      '.worktree/\n.claude/\n.codex/\n'
    )
  })

  it('多条目:三条全都已含 → 原样返回', () => {
    const existing = '*.log\n.worktree/\n.claude/\n.codex/\n'
    expect(buildExcludeContent(existing, ['.worktree/', '.claude/', '.codex/'])).toBe(existing)
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

// 期望值来源:T3 契约用例表的期望列 + git 的事实——`git worktree remove` 只对已登记
// 且目录还在的条目有效,目录被手工删掉后只能靠 `git worktree prune` 清残留登记。
describe('删除动作(pickRemovalAction)', () => {
  it('目录在、git 已登记:remove', () => {
    expect(pickRemovalAction({ dirExists: true, registered: true })).toBe('remove')
  })

  it('目录不在、git 已登记:prune', () => {
    expect(pickRemovalAction({ dirExists: false, registered: true })).toBe('prune')
  })
})

// 假服务记录入参,不打真实 git(T3 契约:service 与 dirExists 可注入)。期望值来源:
// 契约用例表 3/4/5 行 + spec 覆盖标准 4(未提交改动时两者都不删)、10(--force)、12(都不在就跳过)。
const worktreePath = 'D:/demo/.worktree/feat-a'

interface FakeServiceCalls {
  removed: Array<{ root: string; path: string; force: boolean }>
  pruned: string[]
}

// 哨兵:这些用例期望「应用自己删目录」这条分支根本不被走到,被调到就让测试炸出来
const noRemoveDir = async (): Promise<void> => {
  throw new Error('removeDir 不应被调用')
}

function createFakeService(p: {
  registeredPaths: string[]
  removeError?: string
  listError?: string
}): {
  service: WorktreeService
  calls: FakeServiceCalls
} {
  const calls: FakeServiceCalls = { removed: [], pruned: [] }
  const service: WorktreeService = {
    isRepoRoot: async () => true,
    list: async () => {
      if (p.listError !== undefined) {
        throw new Error(p.listError)
      }
      return p.registeredPaths.map((path) => ({ path, branch: '' }))
    },
    add: async () => {},
    remove: async (args) => {
      calls.removed.push(args)
      if (p.removeError !== undefined) {
        throw new Error(p.removeError)
      }
    },
    prune: async (root) => {
      calls.pruned.push(root)
    }
  }
  return { service, calls }
}

describe('清理 worktree(removeWorktree)', () => {
  it('有未提交改动(服务抛 git 原文):ok:false 与原文', async () => {
    const errorText =
      "fatal: 'D:/demo/.worktree/feat-a' contains modified or untracked files, use --force to delete it"
    const { service } = createFakeService({
      registeredPaths: [worktreePath],
      removeError: errorText
    })

    const result = await removeWorktree({
      root: 'D:/demo',
      path: worktreePath,
      force: false,
      service,
      dirExists: async () => true,
      removeDir: noRemoveDir
    })

    expect(result).toEqual({ ok: false, error: errorText })
  })

  it('force: true:ok:true,且服务收到 force: true', async () => {
    const { service, calls } = createFakeService({ registeredPaths: [worktreePath] })

    const result = await removeWorktree({
      root: 'D:/demo',
      path: worktreePath,
      force: true,
      service,
      dirExists: async () => true,
      removeDir: noRemoveDir
    })

    expect(result).toEqual({ ok: true })
    expect(calls.removed).toEqual([{ root: 'D:/demo', path: worktreePath, force: true }])
  })

  it('目录与 git 登记都不在:ok:true,remove 与 prune 都不调用', async () => {
    const { service, calls } = createFakeService({ registeredPaths: ['D:/demo'] })

    const result = await removeWorktree({
      root: 'D:/demo',
      path: worktreePath,
      force: false,
      service,
      dirExists: async () => false,
      removeDir: noRemoveDir
    })

    expect(result).toEqual({ ok: true })
    expect(calls.removed).toEqual([])
    expect(calls.pruned).toEqual([])
  })

  // 覆盖标准 5 的接线半段:选 prune 之后确实调到 service.prune(纯函数用例只钉了选择,
  // 这里钉执行;T3 复审指出现有 33 条里没有一条驱动 prune 分支)
  it('目录不在、git 仍登记:ok:true 且调 service.prune,不调 remove', async () => {
    const { service, calls } = createFakeService({ registeredPaths: [worktreePath] })

    const result = await removeWorktree({
      root: 'D:/demo',
      path: worktreePath,
      force: false,
      service,
      dirExists: async () => false,
      removeDir: noRemoveDir
    })

    expect(result).toEqual({ ok: true })
    expect(calls.pruned).toEqual(['D:/demo'])
    expect(calls.removed).toEqual([])
  })

  // list 抛错时我们不知道 git 认不认这条 worktree:T3 复审要求「不知道就别动手」,
  // 但目录也不在时必须有出口,否则项目目录被用户删掉后这条会话永远删不掉
  it('list 抛错、目录在:ok:false,remove 与 prune 都不调', async () => {
    const { service, calls } = createFakeService({
      registeredPaths: [],
      listError: 'fatal: not a git repository'
    })

    const result = await removeWorktree({
      root: 'D:/demo',
      path: worktreePath,
      force: false,
      service,
      dirExists: async () => true,
      removeDir: noRemoveDir
    })

    expect(result).toEqual({ ok: false, error: 'fatal: not a git repository' })
    expect(calls.removed).toEqual([])
    expect(calls.pruned).toEqual([])
  })

  it('list 抛错、目录不在:ok:true(幂等,记录可删)', async () => {
    const { service } = createFakeService({
      registeredPaths: [],
      listError: 'fatal: not a git repository'
    })

    const result = await removeWorktree({
      root: 'D:/demo',
      path: worktreePath,
      force: false,
      service,
      dirExists: async () => false,
      removeDir: noRemoveDir
    })

    expect(result).toEqual({ ok: true })
  })

  // T3 评审 Important-1:目录还在但 git 已不认这条登记(实测可达——有进程占着目录时
  // `git worktree remove` 会先摘掉登记再报 Permission denied)。此时跳过删除会永久留下
  // 应用再也定位不到的孤儿目录,故对「本项目 .worktree/ 下」的路径改由应用自己删。
  it('目录在、git 未登记、路径在 .worktree/ 下:应用自己删目录', async () => {
    const { service: baseService, calls } = createFakeService({ registeredPaths: [] })
    const dirs: string[] = []
    const service = {
      ...baseService,
      list: async () => []
    }
    const result = await removeWorktree({
      root: 'D:/demo',
      path: 'D:/demo/.worktree/feat-a',
      force: true,
      service,
      dirExists: async () => true,
      removeDir: async (path) => {
        dirs.push(path)
      }
    })

    expect(result).toEqual({ ok: true })
    expect(dirs).toEqual(['D:/demo/.worktree/feat-a'])
    expect(calls.removed).toEqual([])
    expect(calls.pruned).toEqual([])
  })

  it('目录在、git 未登记、路径不在 .worktree/ 下:拒绝删,回错误', async () => {
    const { service: baseService } = createFakeService({ registeredPaths: [] })
    const dirs: string[] = []
    const service = {
      ...baseService,
      list: async () => []
    }
    const result = await removeWorktree({
      root: 'D:/demo',
      path: 'D:/other/feat-a',
      force: false,
      service,
      dirExists: async () => true,
      removeDir: async (path) => {
        dirs.push(path)
      }
    })

    expect(result.ok).toBe(false)
    expect(dirs).toEqual([])
  })

  // T6 处理 5:前缀判定必须先 resolve——记录里的路径带 `..` 时,不解析就会让
  // 「仅在 .worktree/ 下才允许应用自删」的守卫失效,删到该目录之外
  it('目录在、git 未登记、路径带 .. 绕过 .worktree/ 前缀:拒绝删,removeDir 不调', async () => {
    const { service } = createFakeService({ registeredPaths: [] })
    const dirs: string[] = []

    const result = await removeWorktree({
      root: 'D:/demo',
      path: 'D:/demo/.worktree/../evil',
      force: true,
      service,
      dirExists: async () => true,
      removeDir: async (path) => {
        dirs.push(path)
      }
    })

    expect(result.ok).toBe(false)
    expect(dirs).toEqual([])
  })

  it('应用自己删目录失败:ok:false 带原文', async () => {
    const { service: baseService } = createFakeService({ registeredPaths: [] })
    const service = {
      ...baseService,
      list: async () => []
    }
    const result = await removeWorktree({
      root: 'D:/demo',
      path: 'D:/demo/.worktree/feat-a',
      force: true,
      service,
      dirExists: async () => true,
      removeDir: async () => {
        throw new Error('EBUSY: resource busy or locked')
      }
    })

    expect(result).toEqual({ ok: false, error: 'EBUSY: resource busy or locked' })
  })

  // 这个分支已失去 git 的脏检查兜底,而 rm 不是原子的:没有 force 就只回错误,交给二次确认
  it('目录在、git 未登记、未给 force:拒绝,removeDir 不调', async () => {
    const { service } = createFakeService({ registeredPaths: [] })
    const dirs: string[] = []

    const result = await removeWorktree({
      root: 'D:/demo',
      path: 'D:/demo/.worktree/feat-a',
      force: false,
      service,
      dirExists: async () => true,
      removeDir: async (path) => {
        dirs.push(path)
      }
    })

    expect(result.ok).toBe(false)
    expect(dirs).toEqual([])
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

  // 覆盖标准 10「带强制参数删除 → 用 --force 执行」的前半段:T3 评审 Minor-1 指出
  // 现有 force 用例只到接口层,真正决定 --force 能不能到达 git 的是这里的实参拼装。
  it('remove:force 为 false 时参数不带 --force', async () => {
    const calls: Array<{ root: string; args: string[] }> = []
    const service = createWorktreeService(async (root, args) => {
      calls.push({ root, args })
      return ''
    })

    await service.remove({ root: 'D:/demo', path: 'D:/demo/.worktree/feat-a', force: false })

    expect(calls).toEqual([
      { root: 'D:/demo', args: ['worktree', 'remove', 'D:/demo/.worktree/feat-a'] }
    ])
  })

  it('remove:force 为 true 时参数带 --force;prune 只发 worktree prune', async () => {
    const calls: Array<{ root: string; args: string[] }> = []
    const service = createWorktreeService(async (root, args) => {
      calls.push({ root, args })
      return ''
    })

    await service.remove({ root: 'D:/demo', path: 'D:/demo/.worktree/feat-a', force: true })
    await service.prune('D:/demo')

    expect(calls).toEqual([
      { root: 'D:/demo', args: ['worktree', 'remove', '--force', 'D:/demo/.worktree/feat-a'] },
      { root: 'D:/demo', args: ['worktree', 'prune'] }
    ])
  })
})
