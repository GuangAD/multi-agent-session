// agent 配置契约:定义结构与状态规则(spec「数据结构」;主进程 src/main/agents 引用,渲染层只读)
// AgentId 复用 shared/types,不在此重复定义(单一拼写)。
// 结构化克隆注意:Electron IPC 支持 RegExp、不支持函数——定义挂着 sessions 函数,
// agents:list 出站前必须剥离(见 src/main/agents/agent-list.ts 的 buildAgentListItem)。
import type { AgentId } from './types'

// 状态规则:hook 事件映射(hook-run-state 特性,2026-11-23 门 1)
// 事件名 = 各 CLI 原生 hook 事件名;引擎按「事件命中槽 → 置该状态」事实直落,
// 读屏三源(标题/快照/字节)与安静门槛/去抖随 ADR-0001 路线一并退役(ADR-0007)。
export interface AgentStateRules {
  hooks: {
    working: string[] // 事件名 → 置 working
    waiting: string[] // 事件名 → 置 waiting(空数组 = 该家无等待事件,如 antigravity)
    idle: string[] // 事件名 → 置 idle
  }
}

// hook 注入声明(hook-run-state T3:注入器按 kind 分发配置合并;事件清单由注入器从
// state.hooks 三槽并集推导,不在此重复)。无声明的插件不注入(向前兼容)。
export type HookInstallKind =
  | 'claude-settings'
  | 'codex-json'
  | 'antigravity-json'
  | 'pi-extension'
  | 'kimi-toml'

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
  icon?: string // 完整 SVG 文档字符串;插件包 icon.svg 经 ?raw 构建期内联,可内联覆盖;缺省 undefined(渲染层兜底砖)
  color: string // 品牌色(固定色值,不随主题)
  state: AgentStateRules
  hooks?: { kind: HookInstallKind } // hook 注入声明;缺省 = 该 agent 不注入
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
