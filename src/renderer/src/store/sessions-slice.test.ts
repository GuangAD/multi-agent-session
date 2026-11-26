// sessions-slice 测试(T3.5 评审期 Fix-B):渲染层先开 tab 拿到 fit 提案尺寸、再带尺寸 spawn。
// 期望值来源:契约 Fix-B 行为描述(开 tab 前不 spawn / 尺寸透传 / 只消费一次 / 失败不留僵尸 tab)
// + 手算字面量;bridge 打桩,不起真实 IPC 与 PTY。
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { create, type StateCreator } from 'zustand'
import { bridge } from '../ipc/bridge'
import type { AgentListItem } from '../../../shared/agents'
import type { Project, Session } from '../../../shared/types'
import { createSessionsSlice, type SessionsSlice } from './sessions-slice'

vi.mock('../ipc/bridge', () => ({
  bridge: {
    sessions: { create: vi.fn(), open: vi.fn() },
    pty: { spawn: vi.fn(), kill: vi.fn() },
    worktree: { create: vi.fn() }
  }
}))

const createMock = vi.mocked(bridge.sessions.create)
const openMock = vi.mocked(bridge.sessions.open)
const spawnMock = vi.mocked(bridge.pty.spawn)
const worktreeCreateMock = vi.mocked(bridge.worktree.create)

const project: Project = { id: 'p1', path: 'D:\\demo-project', name: 'demo-project' }
const agent = {
  def: { id: 'claude', name: 'Claude Code', command: 'claude', icon: 'claude', state: {} },
  installed: true
} as unknown as AgentListItem

function makeSession(id: string): Session {
  return {
    id,
    projectId: project.id,
    agentId: 'claude',
    title: 'Claude Code',
    createdAt: '2026-11-21T00:00:00.000Z',
    origin: 'created'
  }
}

// 切片按 AppState 上下文声明(StateCreator<AppState>);单测只装这一个切片,
// 以 StateCreator<SessionsSlice> 形态断言复用——行为等价,类型面收窄
const sliceCreator = createSessionsSlice as unknown as StateCreator<SessionsSlice, [], []>

function makeStore() {
  return create<SessionsSlice>()(sliceCreator)
}

beforeEach(() => {
  createMock.mockReset()
  openMock.mockReset()
  spawnMock.mockReset()
  worktreeCreateMock.mockReset()
  createMock.mockResolvedValue(makeSession('s1'))
  spawnMock.mockResolvedValue(undefined)
})

describe('openSession(spawn 时序)', () => {
  it('只建会话并开 tab,不在创建阶段 spawn(tab 挂载后才有 fit 尺寸)', async () => {
    const store = makeStore()
    // 换 re-create 路径的 session id,避免与其他用例共享状态(切片内 pendingSpawns 为模块级)
    createMock.mockResolvedValue(makeSession('s-open'))
    await store.getState().openSession(project, agent)

    expect(spawnMock, '开 tab 前不得 spawn:此时没有真实 fit 尺寸').not.toHaveBeenCalled()
    expect(store.getState().tabs.map((tab) => tab.sessionId)).toEqual(['s-open'])
    expect(store.getState().activeTabId).toBe('s-open')
  })

  it('create 拒绝:不开 tab、不 spawn(与既有失败兜底同款)', async () => {
    const store = makeStore()
    createMock.mockRejectedValue(new Error('create failed'))
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await store.getState().openSession(project, agent)

    expect(store.getState().tabs).toEqual([])
    expect(spawnMock).not.toHaveBeenCalled()
    expect(errorSpy).toHaveBeenCalled()
    errorSpy.mockRestore()
  })
})

describe('spawnOnTerminalReady', () => {
  it('首个 fit 回调:带真实 cols/rows spawn,并只消费一次', async () => {
    const store = makeStore()
    createMock.mockResolvedValue(makeSession('s-ready'))
    await store.getState().openSession(project, agent)

    await store.getState().spawnOnTerminalReady('s-ready', 160, 46)
    expect(spawnMock).toHaveBeenCalledTimes(1)
    expect(spawnMock).toHaveBeenCalledWith({
      sessionId: 's-ready',
      agentId: 'claude',
      cwd: 'D:\\demo-project',
      cols: 160,
      rows: 46
    })

    // 重入(StrictMode 双挂载 / 二次 fit 回调):不得重复 spawn
    await store.getState().spawnOnTerminalReady('s-ready', 160, 46)
    expect(spawnMock, 'pending 消费后重入不得再 spawn').toHaveBeenCalledTimes(1)
  })

  it('未知 sessionId(非本切片发起):静默忽略,不 spawn', async () => {
    const store = makeStore()
    await store.getState().spawnOnTerminalReady('s-unknown', 80, 24)
    expect(spawnMock).not.toHaveBeenCalled()
  })

  it('spawn 失败:撤掉已开的 tab,不留僵尸 tab', async () => {
    const store = makeStore()
    createMock.mockResolvedValue(makeSession('s-fail'))
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await store.getState().openSession(project, agent)
    spawnMock.mockRejectedValue(new Error('spawn failed'))

    await store.getState().spawnOnTerminalReady('s-fail', 120, 40)

    expect(store.getState().tabs, 'spawn 失败不得留下僵尸 tab').toEqual([])
    expect(store.getState().activeTabId).toBeNull()
    expect(errorSpy).toHaveBeenCalled()
    errorSpy.mockRestore()
  })
})

// 期望值来源:brief 第 2 节目标 6/7(会话的终端在该 worktree 目录里运行 agent);
// 只验证 spawn 载荷的 cwd,不重复 T1 的纯函数规则。
describe('worktree 运行目录', () => {
  const worktree = {
    path: 'D:\\demo-project\\.worktree\\feat-a',
    branch: 'feat-a',
    baseBranch: 'main'
  }

  it('开一条带 worktree 的会话:spawn 的 cwd 是 worktree 路径', async () => {
    const store = makeStore()
    createMock.mockResolvedValue({ ...makeSession('s-open-wt'), worktree })

    await store.getState().openSession(project, agent)
    await store.getState().spawnOnTerminalReady('s-open-wt', 120, 40)

    expect(spawnMock).toHaveBeenCalledWith({
      sessionId: 's-open-wt',
      agentId: 'claude',
      cwd: worktree.path,
      cols: 120,
      rows: 40
    })
  })

  it('重开同上:spawn 的 cwd 是 worktree 路径', async () => {
    const store = makeStore()
    const session = { ...makeSession('s-reopen-wt'), worktree }
    openMock.mockResolvedValue(session)

    await store.getState().reopenSession(session, project)
    await store.getState().spawnOnTerminalReady('s-reopen-wt', 120, 40)

    expect(spawnMock).toHaveBeenCalledWith({
      sessionId: 's-reopen-wt',
      agentId: 'claude',
      cwd: worktree.path,
      cols: 120,
      rows: 40
    })
  })
})

// 期望值来源:会话记录契约的 createdAt 倒序——session-records.listByProject 与启动 loadSessions
// 拿到的都是新记录在前,故新建记录必须落在列表首位;下面用数组字面量手写独立期望,
// 不用被测代码的同款算法重算。把前插改回追加,本组首个用例即转红。
describe('sessions 记录顺序(与 listByProject 的 createdAt 倒序一致)', () => {
  it('新建记录前插到首位;已在列表的记录原位替换,不重复追加', async () => {
    const store = makeStore()
    store.setState({ sessions: [makeSession('s-older')] })
    createMock.mockResolvedValue(makeSession('s-newest'))

    await store.getState().openSession(project, agent)

    expect(store.getState().sessions[0]?.id, '新建记录应落在首位').toBe('s-newest')
    expect(store.getState().sessions.map((session) => session.id)).toEqual(['s-newest', 's-older'])

    // 已在列表:原位替换(不移动位置、不重复追加)
    store.setState({ sessions: [makeSession('s-newest'), makeSession('s-existing')] })
    createMock.mockResolvedValue(makeSession('s-existing'))
    await store.getState().openSession(project, agent)

    expect(store.getState().sessions.map((session) => session.id)).toEqual([
      's-newest',
      's-existing'
    ])
  })
})

// 期望值来源:T4 测试规格用例 1(brief 第 2 节目标 2)+ 接口面 createWorktree 的载荷约定;
// worktree.create 打桩,不重复 T2 的冲突规则。
describe('createWorktree(建 worktree 并开标签页)', () => {
  const worktree = {
    path: 'D:\\demo-project\\.worktree\\feat-a',
    branch: 'feat-a',
    baseBranch: 'main'
  }
  const input = { name: 'feat-a', baseBranch: 'main', agentId: 'claude' }

  it('建 worktree 成功:记录入列、标签页打开、activeTabId 指向它', async () => {
    const store = makeStore()
    worktreeCreateMock.mockResolvedValue({
      ok: true,
      session: { ...makeSession('s-wt'), worktree }
    })

    const result = await store.getState().createWorktree(project, input)

    expect(result).toEqual({ ok: true })
    expect(worktreeCreateMock).toHaveBeenCalledWith({ projectId: 'p1', ...input })
    expect(store.getState().sessions.map((session) => session.id)).toEqual(['s-wt'])
    expect(store.getState().tabs.map((tab) => tab.sessionId)).toEqual(['s-wt'])
    expect(store.getState().activeTabId).toBe('s-wt')
  })

  it('建 worktree 的 spawn 目录:首个 fit 后 pty.spawn 的 cwd 为 worktree 路径', async () => {
    const store = makeStore()
    worktreeCreateMock.mockResolvedValue({
      ok: true,
      session: { ...makeSession('s-wt-spawn'), worktree }
    })

    await store.getState().createWorktree(project, input)

    // 与新建会话同一条链路:开 tab 前不 spawn(tab 挂载后才有真实 fit 尺寸)
    expect(spawnMock, '开 tab 前不得 spawn').not.toHaveBeenCalled()
    await store.getState().spawnOnTerminalReady('s-wt-spawn', 120, 40)
    expect(spawnMock).toHaveBeenCalledWith({
      sessionId: 's-wt-spawn',
      agentId: 'claude',
      cwd: worktree.path,
      cols: 120,
      rows: 40
    })
  })

  it('建 worktree 失败:store 不变、返回该 failure 与 detail', async () => {
    const store = makeStore()
    const detail = '名称只能含字母、数字与 ._/-'
    worktreeCreateMock.mockResolvedValue({ ok: false, failure: 'name-invalid', detail })

    const result = await store.getState().createWorktree(project, { ...input, name: 'feat a' })

    expect(result).toEqual({ ok: false, failure: 'name-invalid', detail })
    expect(store.getState().sessions, '失败不得落记录').toEqual([])
    expect(store.getState().tabs, '失败不得开标签页').toEqual([])
    expect(store.getState().activeTabId).toBeNull()
  })

  it('桥接抛错(项目不存在/agent 未知):按 git-error 回,不抛、store 不变', async () => {
    const store = makeStore()
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    worktreeCreateMock.mockRejectedValue(new Error('项目 p1 不存在'))

    const result = await store.getState().createWorktree(project, input)

    expect(result).toEqual({ ok: false, failure: 'git-error', detail: '项目 p1 不存在' })
    expect(store.getState().sessions).toEqual([])
    expect(store.getState().tabs).toEqual([])
    expect(errorSpy).toHaveBeenCalled()
    errorSpy.mockRestore()
  })
})
