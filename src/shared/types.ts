// 进程间契约:渲染层唯一类型来源(AGENTS.md 工程边界)
// 数据模型定义自 spec「数据结构」,plan 附录 B。

// AgentId 开放为字符串(T1 插件化):agent 集合由主进程插件清单决定(agents/plugins),不再是固定联合;
// 渲染层的 Record<AgentId, …> 映射与既有行为自动兼容
export type AgentId = string
export type SessionId = string
export type ProjectId = string

export interface Project {
  id: ProjectId
  path: string // 绝对路径,归一化存储
  name: string // 目录名
}

// worktree 会话的运行目录登记(T1 起为契约字段,建/删编排见后续任务):
// 缺省 = 普通会话,运行目录取所属项目路径
// (spec「数据结构」:路径归一化存储,分支名同时是目录名,baseBranch 是建它时的起点分支)
export interface SessionWorktree {
  path: string // worktree 目录绝对路径,归一化存储
  branch: string // 建出来时使用的分支名,同时是目录名
  baseBranch: string // 起点分支名
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
  activityAt?: string // 导入会话最近活动时间,排序展示
  worktree?: SessionWorktree // 缺省 = 普通会话,运行目录取所属项目路径
}

// 运行时状态,不持久化
export type SessionRunState = 'working' | 'waiting' | 'idle' | 'exited'

// shell 底座(ADR-0004)用哪个:
//  · cmd         —— Windows 原生、起步最快、无 profile,最稳(11 个任务的冒烟基线)
//  · powershell  —— Windows PowerShell 5.1(系统自带);有 tab 补全/历史,但原生参数引号有已知缺陷
//  · pwsh        —— PowerShell 7+(需另装);参数传递更正确,长期目标
export type ShellKind = 'cmd' | 'powershell' | 'pwsh'

export interface Settings {
  defaultAgentId?: AgentId
  scrollbackRows: number // 默认 10000,上限 50000
  appTheme: string // 界面主题 id(shared/themes/app-themes 目录内),默认 'github-dark'
  terminalTheme: string // 终端配色名(Orca 原名,catalog 目录内),默认 'Ghostty Default Style Dark'
  shell: ShellKind // 会话终端里常驻的 shell(agent 退出后你回到的那个提示符)
  terminalFontFamily?: string // 缺省 = 默认回退链
  terminalFontSize: number // 默认 14,范围 [8, 32]
  terminalFontWeight: number // 默认 300,档位 300/400/500
  terminalLineHeight: number // 默认 1.0,范围 [1.0, 2.0]
  terminalCursorStyle: 'block' | 'bar' | 'underline' // 默认 'block'
  terminalCursorBlink: boolean // 默认 false
}

export interface AppStore {
  version: 1
  projects: Project[]
  sessions: Session[]
  settings: Settings
}
