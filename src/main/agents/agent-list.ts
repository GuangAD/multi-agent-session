// agents:list 出站载荷构造(自 ipc/agents.ts 抽取的纯函数;落点契约「src/main/agents/agent-list.ts」)
// Why 剥离 sessions:Electron IPC 结构化克隆支持 RegExp、不支持函数(shared/agents.ts 顶部注释),
// 定义挂了 sessions.scan/resumeArgv 函数,出站前必须摘成 undefined——渲染层只做展示与选择,
// 扫描与续接都在主进程内跑。icon/color 为字符串透传,剥离不动它们(契约:icon 可选、color 必选)。
import type { AgentDefinition, AgentListItem } from '../../shared/agents'

export function buildAgentListItem(
  def: AgentDefinition,
  installed: boolean,
  path?: string
): AgentListItem {
  return {
    def: { ...def, sessions: undefined },
    installed,
    ...(path !== undefined ? { path } : {})
  }
}
