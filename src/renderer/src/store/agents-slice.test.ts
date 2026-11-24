// agents-slice 测试(T2):agents 载荷装载与按 id 查找。期望值来源:T2 测试规格用例表
// (接缝定义「长度 2 且顺序与载荷一致」+ 约束「失败保持空数组」+ brief「未知 agent 不崩」);
// bridge 打桩,不起真实 IPC(与 sessions-slice.test.ts 同款)。
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { create, type StateCreator } from 'zustand'
import { bridge } from '../ipc/bridge'
import type { AgentListItem } from '../../../shared/agents'
import { createAgentsSlice, type AgentsSlice } from './agents-slice'

vi.mock('../ipc/bridge', () => ({
  bridge: {
    agents: { list: vi.fn() }
  }
}))

const listMock = vi.mocked(bridge.agents.list)

// 切片按 AppState 上下文声明(StateCreator<AppState>);单测只装这一个切片,
// 以 StateCreator<AgentsSlice> 形态断言复用——行为等价,类型面收窄(与 ui-slice.test.ts 同款)
const sliceCreator = createAgentsSlice as unknown as StateCreator<AgentsSlice, [], []>

function makeStore() {
  return create<AgentsSlice>()(sliceCreator)
}

// 载荷字面量:icon 可选(claude 有、kimi 无,对应 def.icon?: string 契约),顺序即断言锚点
const payload: AgentListItem[] = [
  {
    def: {
      id: 'claude',
      name: 'Claude Code',
      command: 'claude',
      icon: '<svg xmlns="http://www.w3.org/2000/svg"><path/></svg>',
      color: '#d97757',
      state: { hooks: { working: [], waiting: [], idle: [] } }
    },
    installed: true
  },
  {
    def: { id: 'kimi', name: 'Kimi Code', command: 'kimi', color: '#1783ff', state: { hooks: { working: [], waiting: [], idle: [] } } },
    installed: false
  }
]

beforeEach(() => {
  listMock.mockReset()
})

describe('agents 载荷查找与兜底', () => {
  it('用例 1:loadAgents 装载 bridge.agents.list 载荷,长度 2 且顺序与载荷一致', async () => {
    listMock.mockResolvedValue(payload)
    const store = makeStore()

    await store.getState().loadAgents()

    expect(store.getState().agents).toHaveLength(2)
    expect(store.getState().agents.map((item) => item.def.id)).toEqual(['claude', 'kimi'])
  })

  it('用例 2:list 拒绝:agents 保持 [],loadAgents 不抛错(仅控制台报错)', async () => {
    listMock.mockRejectedValue(new Error('list failed'))
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const store = makeStore()

    await expect(store.getState().loadAgents()).resolves.toBeUndefined()

    expect(store.getState().agents, '失败必须保持空数组').toEqual([])
    expect(errorSpy).toHaveBeenCalled()
    errorSpy.mockRestore()
  })

  it('用例 3:agentById 命中返回载荷项;未知 id 返回 undefined 且不抛错(兜底形态由组件处理)', async () => {
    listMock.mockResolvedValue(payload)
    const store = makeStore()
    await store.getState().loadAgents()

    expect(store.getState().agentById('claude')?.def.color).toBe('#d97757')
    expect(store.getState().agentById('不存在的agent')).toBeUndefined()
  })
})
