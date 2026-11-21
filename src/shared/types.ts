// 进程间契约:渲染层唯一类型来源(AGENTS.md 工程边界)
// 数据模型定义自 spec「数据结构」,plan 附录 B。

export type AgentId = 'claude' | 'codex' | 'antigravity' | 'pi' | 'kimi'
export type SessionId = string
export type ProjectId = string

export interface Project {
  id: ProjectId
  path: string // 绝对路径,归一化存储
  name: string // 目录名
}

export interface Session {
  id: SessionId
  projectId: ProjectId
  agentId: AgentId
  title: string // 应用侧显示名(重命名只改这里)
  externalTitle?: string // agent 侧原名(导入/回填时记录,认亲用)
  createdAt: string // ISO
  lastOpenedAt?: string
  origin: 'created' | 'imported'
  externalSessionId?: string // imported:去重键;created:回填后供续接
  externalFilePath?: string // pi 等按转录路径续接的 agent 需要
  activityAt?: string // 导入会话最近活动时间,排序展示
}

// 运行时状态,不持久化
export type SessionRunState = 'working' | 'waiting' | 'idle' | 'exited'

export interface Settings {
  defaultAgentId?: AgentId
  scrollbackRows: number // 默认 10000,上限 50000
  theme: 'system' | 'light' | 'dark'
}

export interface AppStore {
  version: 1
  projects: Project[]
  sessions: Session[]
  settings: Settings
}
