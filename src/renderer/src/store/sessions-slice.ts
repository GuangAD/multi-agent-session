// 会话切片(T4):sessions = store 里的持久会话记录(重启不丢),tabs = 运行中的标签页
// (CONTEXT.md 职责边界:关闭标签页不影响会话;tab 只挂持久记录 id,元数据一律回记录里取)
import type { StateCreator } from 'zustand'
import { bridge } from '../ipc/bridge'
import type { AgentListItem, ResumeRef } from '../../../shared/agents'
import type { AgentId, Project, ProjectId, Session, SessionId } from '../../../shared/types'
import type { AppState } from './app-store'

// TabSession 只记身份:显示名/项目/agent 等元数据都从 sessions 记录取(记录改了 tab 即时跟随),
// 运行状态从 run-state-slice 取(state:changed 广播,单一来源)
export interface TabSession {
  sessionId: SessionId
}

export interface ImportResult {
  imported: number
  skipped: number
}

export interface SessionsSlice {
  // 已加载项目的会话记录(平铺;按 projectId 分组渲染在侧栏)
  sessions: Session[]
  tabs: TabSession[]
  activeTabId: SessionId | null
  // 按项目逐个拉取记录(spec 契约:sessions:list 载荷是单个 projectId)
  loadSessions: () => Promise<void>
  // 新建(Fix-B):IPC 入库 → 先开 tab(容器挂载后 fit 出真实尺寸)→ 带尺寸 spawn
  openSession: (project: Project, agent: AgentListItem) => Promise<void>
  // 重开:已有 tab 则激活它(双开拦截);否则按持久记录拉起——有 externalSessionId 即续接
  // (自建=回填所得,导入=扫描入库;2026-11-21 需求变更),无 id 原样拉起(T8)
  reopenSession: (session: Session, project: Project) => Promise<void>
  // 终端首个 fit 收敛后由 TerminalView 回调:消费待 spawn 记录并带真实 cols/rows 发起 spawn
  spawnOnTerminalReady: (sessionId: SessionId, cols: number, rows: number) => Promise<void>
  closeTab: (sessionId: SessionId) => Promise<void>
  setActiveTab: (sessionId: SessionId) => void
  renameSession: (id: SessionId, title: string) => Promise<void>
  removeSession: (id: SessionId) => Promise<void>
  // T6:导入该 agent 在本项目下的历史会话(主进程扫描 + 去重),返回条数供 UI 提示
  importSessions: (projectId: ProjectId, agentId: AgentId) => Promise<ImportResult>
  // 主进程回填/标题补捞改写记录后的原位落位(sessions:changed 广播;externalSessionId/标题)
  applyExternalUpdate: (session: Session) => void
}

// 待 spawn 会话:渲染层先开 tab 拿到 fit 提案尺寸再 spawn(Fix-B)。模块级协调数据,
// Why: 不进 store——它只在「tab 已挂载、尚未 spawn」的窗口内有意义,且消费即删,
// 任何渲染路径都不该读它;放进 state 只会制造无谓的重渲染与持久化诱惑。
// ack 只消费一次(消费即删),StrictMode 双挂载/二次 fit 回调的重复触发天然幂等。
// T8:resume 可选(controller 裁决 2)——重开时从记录构造的续接定位原料,
// imported/无 id 的会话不带,原样拉起;经 pty:spawn 载荷透传给主进程。
const pendingSpawns = new Map<SessionId, { agentId: AgentId; cwd: string; resume?: ResumeRef }>()

// 记录落位:已在列表则原位替换(重开刷新 lastOpenedAt / 重命名),否则前插
// Why: 前插对齐会话记录契约的 createdAt 倒序——session-records.listByProject 与启动 loadSessions
// 拿到的都是新记录在前;追加到末尾会让新建会话停在分组底部、重启后又跳到顶部,同一数据两种顺序。
function upsertSession(sessions: Session[], session: Session): Session[] {
  return sessions.some((item) => item.id === session.id)
    ? sessions.map((item) => (item.id === session.id ? session : item))
    : [session, ...sessions]
}

export const createSessionsSlice: StateCreator<AppState, [], [], SessionsSlice> = (set, get) => ({
  sessions: [],
  tabs: [],
  activeTabId: null,

  loadSessions: async () => {
    const projects = get().projects
    const lists = await Promise.all(projects.map((project) => bridge.sessions.list(project.id)))
    set({ sessions: lists.flat() })
  },

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
      sessions: upsertSession(state.sessions, session),
      tabs: [...state.tabs, { sessionId: session.id }],
      activeTabId: session.id
    }))
  },

  reopenSession: async (session, project) => {
    // 同一会话同一时刻最多一个标签页(plan M4:禁止双开);已开则只切过去
    if (get().tabs.some((tab) => tab.sessionId === session.id)) {
      set({ activeTabId: session.id })
      return
    }
    let record: Session
    try {
      record = await bridge.sessions.open(session.id)
    } catch (error) {
      console.error(`重开会话 ${session.title} 失败:`, error)
      return
    }
    // 连点/并发点击兜底:open 往返期间另一路已开好 tab,则只切过去,不重复开(同会话禁止双开)
    if (get().tabs.some((tab) => tab.sessionId === record.id)) {
      set({ activeTabId: record.id })
      return
    }
    // 与新建同一条链路:先开 tab,首个 fit 后带尺寸 spawn。
    // 续接定位:有 externalSessionId 即带 ref——自建会话来自回填,导入会话来自扫描入库
    // (2026-11-21 需求变更,plan 开发记录 20:15 条:导入的历史会话同样续接);无 id → 原样拉起。
    // resumeArgv 返回 null(该 agent 无续接参数)时主进程原样拉起,不抛错。
    const resume: ResumeRef | undefined = record.externalSessionId
      ? { id: record.externalSessionId }
      : undefined
    pendingSpawns.set(record.id, {
      agentId: record.agentId,
      cwd: project.path,
      ...(resume ? { resume } : {})
    })
    set((state) => ({
      sessions: upsertSession(state.sessions, record),
      tabs: [...state.tabs, { sessionId: record.id }],
      activeTabId: record.id
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
        rows,
        ...(pending.resume ? { resume: pending.resume } : {})
      })
    } catch (error) {
      console.error('启动会话失败:', error)
      // spawn 失败不留僵尸 tab(与原「失败不开 tab」语义等价:tab 已开故回撤)
      set((state) => {
        const index = state.tabs.findIndex((tab) => tab.sessionId === sessionId)
        const tabs = state.tabs.filter((tab) => tab.sessionId !== sessionId)
        const activeTabId =
          state.activeTabId === sessionId
            ? (tabs[Math.min(Math.max(index, 0), tabs.length - 1)]?.sessionId ?? null)
            : state.activeTabId
        return { tabs, activeTabId }
      })
    }
  },

  closeTab: async (sessionId) => {
    // 先杀进程再撤 tab;已退出的会话主进程对 kill 静默忽略,幂等
    await bridge.pty.kill(sessionId)
    set((state) => {
      const index = state.tabs.findIndex((tab) => tab.sessionId === sessionId)
      if (index === -1) {
        return state
      }
      const tabs = state.tabs.filter((tab) => tab.sessionId !== sessionId)
      // 关闭当前 tab 时激活邻位(右侧优先取原位置,末端则取前一个)
      const activeTabId =
        state.activeTabId === sessionId
          ? (tabs[Math.min(index, tabs.length - 1)]?.sessionId ?? null)
          : state.activeTabId
      return { tabs, activeTabId }
    })
  },

  setActiveTab: (sessionId) => {
    set({ activeTabId: sessionId })
  },

  renameSession: async (id, title) => {
    try {
      await bridge.sessions.rename({ id, title })
    } catch (error) {
      console.error('重命名会话失败:', error)
      return
    }
    set((state) => ({
      sessions: state.sessions.map((session) =>
        session.id === id ? { ...session, title } : session
      )
    }))
  },

  removeSession: async (id) => {
    let closedTabs: SessionId[]
    try {
      closedTabs = (await bridge.sessions.remove(id)).closedTabs
    } catch (error) {
      console.error('删除会话失败:', error)
      return
    }
    // 主进程按活动 PTY 返回需连带关闭的 tab;记录已删,挂在该记录上的 tab(含进程已退出)一律撤
    const boundTabs = get()
      .tabs.filter((tab) => tab.sessionId === id)
      .map((tab) => tab.sessionId)
    for (const tabId of new Set([...closedTabs, ...boundTabs])) {
      await get().closeTab(tabId)
    }
    set((state) => ({ sessions: state.sessions.filter((session) => session.id !== id) }))
  },

  importSessions: async (projectId, agentId) => {
    const result = await bridge.sessions.import({ projectId, agentId })
    // 导入只改主进程 store:重新拉该项目的记录并整体替换(一次导入可能落多条,原位合并反而更绕)
    const list = await bridge.sessions.list(projectId)
    set((state) => ({
      sessions: [...state.sessions.filter((session) => session.projectId !== projectId), ...list]
    }))
    return result
  },
  // 主进程回填/标题补捞改写记录后的原位落位(sessions:changed 广播):与 renameSession 同语义
  applyExternalUpdate: (session) => {
    set((state) => ({ sessions: upsertSession(state.sessions, session) }))
  }
})
