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

// shell 底座(ADR-0004)用哪个:
//  · cmd         —— Windows 原生、起步最快、无 profile,最稳(11 个任务的冒烟基线)
//  · powershell  —— Windows PowerShell 5.1(系统自带);有 tab 补全/历史,但原生参数引号有已知缺陷
//  · pwsh        —— PowerShell 7+(需另装);参数传递更正确,长期目标
export type ShellKind = 'cmd' | 'powershell' | 'pwsh'

export interface Settings {
  defaultAgentId?: AgentId
  scrollbackRows: number // 默认 10000,上限 50000
  theme: 'system' | 'light' | 'dark'
  shell: ShellKind // 会话终端里常驻的 shell(agent 退出后你回到的那个提示符)
  appThemeDark: string // 界面主题深槽 id,默认 'default'
  appThemeLight: string // 界面主题浅槽 id,默认 'default'
  terminalThemeDark: string // 终端主题深槽 id(Orca 原名),默认 'Ghostty Default Style Dark'
  terminalThemeLight: string // 终端主题浅槽 id,默认 'Builtin Tango Light'
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
