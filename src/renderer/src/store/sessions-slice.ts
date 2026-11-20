// 会话内存表切片(T3):tab = 运行中的终端画面,会话记录持久化 CRUD 是 T4
// (CONTEXT.md 职责边界:关闭标签页不影响会话;本切片只管运行态,重启即清空)
import type { StateCreator } from 'zustand'
import { bridge } from '../ipc/bridge'
import type { AgentListItem } from '../../../shared/agents'
import type { Project, Session, SessionId } from '../../../shared/types'
import type { AppState } from './app-store'

// TabSession 自定形状:session 元数据 + 运行态标记(运行态不持久化)
export interface TabSession {
  session: Session
  runState: 'running' | 'exited' // pty:exit 后转 exited
}

export interface SessionsSlice {
  tabs: TabSession[]
  activeTabId: SessionId | null
  // 新建链路:IPC create → spawn → 开 tab(controller:菜单已按安装状态挡一层)
  openSession: (project: Project, agent: AgentListItem) => Promise<void>
  closeTab: (sessionId: SessionId) => Promise<void>
  setActiveTab: (sessionId: SessionId) => void
  markSessionExited: (sessionId: SessionId) => void
}

export const createSessionsSlice: StateCreator<AppState, [], [], SessionsSlice> = (set) => ({
  tabs: [],
  activeTabId: null,

  openSession: async (project, agent) => {
    // Why: create 与 spawn 同 try——create 拒绝时也走统一兜底,不致 unhandled rejection
    let session: Session
    try {
      session = await bridge.sessions.create({ projectId: project.id, agentId: agent.def.id })
      await bridge.pty.spawn({ sessionId: session.id, agentId: agent.def.id, cwd: project.path })
    } catch (error) {
      // 菜单已按安装状态挡一层,这里兜底(create 拒绝/spawn 失败同款);tab 不开,会话不留
      console.error(`启动 ${agent.def.name} 会话失败:`, error)
      return
    }
    set((state) => ({
      tabs: [...state.tabs, { session, runState: 'running' }],
      activeTabId: session.id
    }))
  },

  closeTab: async (sessionId) => {
    // 先杀进程再撤 tab;已退出的会话主进程对 kill 静默忽略,幂等
    await bridge.pty.kill(sessionId)
    set((state) => {
      const index = state.tabs.findIndex((tab) => tab.session.id === sessionId)
      if (index === -1) {
        return state
      }
      const tabs = state.tabs.filter((tab) => tab.session.id !== sessionId)
      // 关闭当前 tab 时激活邻位(右侧优先取原位置,末端则取前一个)
      const activeTabId =
        state.activeTabId === sessionId
          ? (tabs[Math.min(index, tabs.length - 1)]?.session.id ?? null)
          : state.activeTabId
      return { tabs, activeTabId }
    })
  },

  setActiveTab: (sessionId) => {
    set({ activeTabId: sessionId })
  },

  markSessionExited: (sessionId) => {
    set((state) => ({
      tabs: state.tabs.map((tab) =>
        tab.session.id === sessionId && tab.runState !== 'exited'
          ? { ...tab, runState: 'exited' }
          : tab
      )
    }))
  }
})
