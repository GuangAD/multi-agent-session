// agents 域薄编排层:注册表清单 + PATH 安装检测,一次返回全部定义与安装状态
// (样板同 ipc/projects.ts;agents:list 不需要 store)
import { ipcMain } from 'electron'
import { IPC_CHANNELS } from './channels'
import { agentRegistry } from '../agents/agent-registry'
import { buildAgentListItem } from '../agents/agent-list'
import { resolveCommandPath } from '../command-path/command-path-resolver'
import { forEachWithConcurrency } from '../command-path/map-with-concurrency'
import type { AgentListItem } from '../../shared/agents'

// 并发上限沿 Orca 检测的档位(命令数超过 4 时用 4;本仓固定清单 5 个,恰落在该档)
const DETECTION_CONCURRENCY = 4

export function registerAgentsIpc(): void {
  ipcMain.handle(IPC_CHANNELS.agentsList, async (): Promise<AgentListItem[]> => {
    const defs = agentRegistry.list()
    const items: AgentListItem[] = new Array(defs.length)
    // 按索引回填,保住注册顺序;单命令探测失败按未命中处理(resolveCommandPath 已吞 fs 异常)
    await forEachWithConcurrency(defs, DETECTION_CONCURRENCY, async (def, index) => {
      const resolved = await resolveCommandPath(def.command)
      // Why: 定义挂着 sessions 函数,结构化克隆不支持函数;载荷构造(含剥离)抽成纯函数
      // agents/agent-list.ts,单测直接钉形状(icon/color 透传、函数剥离)。
      items[index] = buildAgentListItem(def, resolved !== null, resolved ?? undefined)
    })
    return items
  })
}
