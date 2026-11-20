// IPC 契约:通道名与载荷类型一一对应(spec 模块划分「契约先行」)
// 通道由任务增量补:T1 落 projects 三通道;T2 增补 agents:list;
// T3 增补 sessions:create、settings:get 与 pty:* 五通道(spawn/write/resize/kill + data/exit 事件)。
import type { AgentListItem } from './agents'
import type { AgentId, Project, ProjectId, Session, SessionId, Settings } from './types'

// 通道名常量:main/ipc/channels.ts 转发使用,preload 直接引用,保证单一拼写
export const IPC_CHANNELS = {
  projectsList: 'projects:list',
  projectsAdd: 'projects:add',
  projectsRemove: 'projects:remove',
  agentsList: 'agents:list',
  sessionsCreate: 'sessions:create',
  settingsGet: 'settings:get',
  ptySpawn: 'pty:spawn',
  ptyWrite: 'pty:write',
  ptyResize: 'pty:resize',
  ptyKill: 'pty:kill',
  // 主进程 → 渲染层事件通道(ipcRenderer.on 订阅)
  ptyData: 'pty:data',
  ptyExit: 'pty:exit'
} as const

// preload 暴露给渲染层的桥接 API 面;main 按此注册 handler
export interface ProjectsApi {
  list: () => Promise<Project[]>
  add: () => Promise<Project | null> // null:用户取消了目录选择
  remove: (id: ProjectId) => Promise<void>
}

export interface AgentsApi {
  // 安装检测在主进程完成:一次返回全部定义与安装状态(def 可整体结构化克隆)
  list: () => Promise<AgentListItem[]>
}

// T3 最小实现:构造 Session 返回渲染层,不写 store(T4 落 sessionRecords 持久化)
export interface SessionsApi {
  create: (p: { projectId: ProjectId; agentId: AgentId }) => Promise<Session>
}

// 终端渲染参数(scrollback 默认 10000);T3 只读,设置界面后续任务
export interface SettingsApi {
  get: () => Promise<Settings>
}

export interface PtyDataEvent {
  sessionId: SessionId
  data: string
}

export interface PtyExitEvent {
  sessionId: SessionId
  exitCode: number
}

export interface PtyApi {
  spawn: (p: { sessionId: SessionId; agentId: AgentId; cwd: string }) => Promise<void>
  write: (p: { sessionId: SessionId; data: string }) => Promise<void>
  resize: (p: { sessionId: SessionId; cols: number; rows: number }) => Promise<void>
  kill: (sessionId: SessionId) => Promise<void>
  // 事件订阅用 ipcRenderer.on 类型化封装;订阅返回退订函数(契约推荐形态)
  onPtyData: (listener: (event: PtyDataEvent) => void) => () => void
  onPtyExit: (listener: (event: PtyExitEvent) => void) => () => void
}

export interface AppApi {
  projects: ProjectsApi
  agents: AgentsApi
  sessions: SessionsApi
  settings: SettingsApi
  pty: PtyApi
}
