// agents 载荷切片(T2):启动装载一次(bridge.agents.list()),按 id 查找。
// 未知 id 返回 undefined(纯查找)——首字母兜底砖的形态处理在 agents-display 的 AgentBadge,
// 调用方从载荷取 icon/color/name 传入,查无即全缺省;渲染层不持任何按 id 的硬编码表。
import type { StateCreator } from 'zustand'
import { bridge } from '../ipc/bridge'
import type { AgentListItem } from '../../../shared/agents'
import type { AppState } from './app-store'

export interface AgentsSlice {
  // agents:list 载荷(def 携带 icon/color 字符串,出站剥函数已由主进程保证)
  agents: AgentListItem[]
  // 启动装载一次;失败仅控制台报错并保持 [](不抛,App 启动链路不受影响)
  loadAgents: () => Promise<void>
  // 纯查找:命中返回载荷项,未知 id 返回 undefined
  agentById: (agentId: string) => AgentListItem | undefined
}

export const createAgentsSlice: StateCreator<AppState, [], [], AgentsSlice> = (set, get) => ({
  agents: [],

  loadAgents: async () => {
    try {
      const list = await bridge.agents.list()
      set({ agents: list })
    } catch (error) {
      console.error('加载 agent 清单失败:', error)
    }
  },

  agentById: (agentId) => get().agents.find((item) => item.def.id === agentId)
})
