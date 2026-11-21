// 会话内存表切片(T3):tab = 运行中的终端画面,会话记录持久化 CRUD 是 T4
// (CONTEXT.md 职责边界:关闭标签页不影响会话;本切片只管运行态,重启即清空)
import type { StateCreator } from 'zustand'
import { bridge } from '../ipc/bridge'
import type { AgentListItem } from '../../../shared/agents'
import type { AgentId, Project, Session, SessionId } from '../../../shared/types'
import type { AppState } from './app-store'

// TabSession 自定形状:session 元数据 + 运行态标记(运行态不持久化)
export interface TabSession {
  session: Session
  runState: 'running' | 'exited' // pty:exit 后转 exited
}

export interface SessionsSlice {
  tabs: TabSession[]
  activeTabId: SessionId | null
  // 新建链路(Fix-B):IPC create → 先开 tab(容器挂载后 fit 出真实尺寸)→ 带尺寸 spawn
  openSession: (project: Project, agent: AgentListItem) => Promise<void>
  // 终端首个 fit 收敛后由 TerminalView 回调:消费待 spawn 记录并带真实 cols/rows 发起 spawn
  spawnOnTerminalReady: (sessionId: SessionId, cols: number, rows: number) => Promise<void>
  closeTab: (sessionId: SessionId) => Promise<void>
  setActiveTab: (sessionId: SessionId) => void
  markSessionExited: (sessionId: SessionId) => void
}

// 待 spawn 会话:渲染层先开 tab 拿到 fit 提案尺寸再 spawn(Fix-B)。模块级协调数据,
// Why: 不进 store——它只在「tab 已挂载、尚未 spawn」的窗口内有意义,且消费即删,
// 任何渲染路径都不该读它;放进 state 只会制造无谓的重渲染与持久化诱惑。
// ack 只消费一次(消费即删),StrictMode 双挂载/二次 fit 回调的重复触发天然幂等。
const pendingSpawns = new Map<SessionId, { agentId: AgentId; cwd: string }>()

export const createSessionsSlice: StateCreator<AppState, [], [], SessionsSlice> = (set) => ({
  tabs: [],
  activeTabId: null,

  openSession: async (project, agent) => {
    let session: Session
    try {
      session = await bridge.sessions.create({ projectId: project.id, agentId: agent.def.id })
    } catch (error) {
      // 菜单已按安装状态挡一层,这里兜底;create 拒绝则 tab 不开、会话不留
      console.error(`启动 ${agent.def.name} 会话失败:`, error)
      return
    }
    // Fix-B:先开 tab——TerminalView 挂载后 fit 出真实尺寸,再经 spawnOnTerminalReady 带尺寸 spawn。
    // Why: TUI(pi 等)在 Windows ConPTY 下收不到 resize 通知(nodejs/node#13197),启动宽度即它
    // 看到的终身宽度;先 spawn(80×24)再 fit 会让大窗口下的 TUI 永远画在旧宽度,右侧整段空白。
    pendingSpawns.set(session.id, { agentId: agent.def.id, cwd: project.path })
    set((state) => ({
      tabs: [...state.tabs, { session, runState: 'running' }],
      activeTabId: session.id
    }))
  },

  spawnOnTerminalReady: async (sessionId, cols, rows) => {
    const pending = pendingSpawns.get(sessionId)
    if (!pending) {
      return // 已消费(二次 fit 回调)或非本切片发起的 tab:静默忽略
    }
    pendingSpawns.delete(sessionId) // 消费即删:重入不重复 spawn
    try {
      await bridge.pty.spawn({
        sessionId,
        agentId: pending.agentId,
        cwd: pending.cwd,
        cols,
        rows
      })
    } catch (error) {
      console.error('启动会话失败:', error)
      // spawn 失败不留僵尸 tab(与原「失败不开 tab」语义等价:tab 已开故回撤)
      set((state) => {
        const index = state.tabs.findIndex((tab) => tab.session.id === sessionId)
        const tabs = state.tabs.filter((tab) => tab.session.id !== sessionId)
        const activeTabId =
          state.activeTabId === sessionId
            ? (tabs[Math.min(Math.max(index, 0), tabs.length - 1)]?.session.id ?? null)
            : state.activeTabId
        return { tabs, activeTabId }
      })
    }
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
