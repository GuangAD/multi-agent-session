// agent 配置契约:定义结构与状态规则(spec「shared/agents.ts 数据结构」;主进程 src/main/agents 引用,渲染层只读)
// AgentId 复用 shared/types,不在此重复定义(单一拼写)。
// 结构化克隆注意:Electron IPC 支持 RegExp、不支持函数——定义不挂 sessions 函数时可整体过桥(T2 口径)。
import type { AgentId } from './types'

export interface AgentStateRules {
  title?: { working: RegExp[]; idle: RegExp[] } // 终端标题正则
  screen?: { working: string[]; waiting: string[] } // 屏幕文字地标(子串)
  bytes?: { working: string[]; waiting: string[] } // 字节流子串(跨 chunk 拼接后匹配)
  idleQuietMs?: number // idle 判定要求的安静时长
  degraded?: boolean // true:只用「有输出=working、退出=exited」
}

// 会话扫描候选(T6/T7 落地扫描器时产出;本任务只定结构)
export interface ImportCandidate {
  externalSessionId: string
  externalTitle?: string
  filePath?: string
  cwd: string
  activityAt?: string
}

export interface AgentDefinition {
  id: AgentId
  name: string
  command: string // PATH 探测命令名
  aliases?: string[] // 如 kimi-code
  icon: string // 第一版为首字母徽标 id
  state: AgentStateRules
  sessions?: {
    // 本任务留空位,T5–T8 填充(函数不可过 IPC,挂载后 agents:list 需摘除)
    scan: (projectPath: string) => Promise<ImportCandidate[]>
    resumeArgv: (ref: { id?: string; filePath?: string }) => string[] | null
  }
}

// 'agents:list' 载荷:定义 + 主进程实测的安装状态(spec IPC 契约)
export interface AgentListItem {
  def: AgentDefinition
  installed: boolean
  path?: string
}
