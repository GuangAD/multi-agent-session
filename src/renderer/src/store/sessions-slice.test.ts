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
    sessions: { create: vi.fn() },
    pty: { spawn: vi.fn(), kill: vi.fn() }
  }
}))

const createMock = vi.mocked(bridge.sessions.create)
const spawnMock = vi.mocked(bridge.pty.spawn)

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
  spawnMock.mockReset()
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
    expect(store.getState().tabs.map((tab) => tab.session.id)).toEqual(['s-open'])
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
