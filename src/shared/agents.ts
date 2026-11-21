// agent 配置契约:定义结构与状态规则(spec「shared/agents.ts 数据结构」;主进程 src/main/agents 引用,渲染层只读)
// AgentId 复用 shared/types,不在此重复定义(单一拼写)。
// 结构化克隆注意:Electron IPC 支持 RegExp、不支持函数——T6 起定义挂了 sessions 函数,
// agents:list 出站前必须剥离(见 ipc/agents.ts 的摘除与 `// Why:`)。
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
    // T6:从 agent 存储扫出会话候选(homeDir 注入供测试与自定义 agent home;缺省 os.homedir())
    scan?: (projectPath: string, ctx?: { homeDir?: string }) => Promise<ImportCandidate[]>
    // T8:重开时的续接参数;null = 该 agent 不支持续接(原样拉起)
    resumeArgv?: (ref: { id?: string; filePath?: string }) => string[] | null
  }
}

// 'agents:list' 载荷:定义 + 主进程实测的安装状态(spec IPC 契约)
export interface AgentListItem {
  def: AgentDefinition
  installed: boolean
  path?: string
}
