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

// T8:续接定位原料——id(多数 agent)或转录路径(pi 按文件续接);两字段可选,
// 由各定义自取。渲染层从会话记录构造(externalSessionId/externalFilePath),经 pty:spawn 透传。
export interface ResumeRef {
  id?: string
  filePath?: string
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
    // T8:重开时的续接参数;返回「参数部分」不含命令名(controller 裁决 1:命令本体由
    // spawn 链路 resolveCommandPath 解析,重复返回会注入两次);null = 不支持续接(原样拉起)
    resumeArgv?: (ref: ResumeRef) => string[] | null
  }
}

// 'agents:list' 载荷:定义 + 主进程实测的安装状态(spec IPC 契约)
export interface AgentListItem {
  def: AgentDefinition
  installed: boolean
  path?: string
}
