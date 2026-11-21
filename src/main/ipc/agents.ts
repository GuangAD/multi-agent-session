// agents 域薄编排层:注册表清单 + PATH 安装检测,一次返回全部定义与安装状态
// (样板同 ipc/projects.ts;agents:list 不需要 store)
import { ipcMain } from 'electron'
import { IPC_CHANNELS } from './channels'
import { agentRegistry } from '../agents/agent-registry'
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
      items[index] = {
        // Why: T6 起定义挂着 sessions.scan(函数),结构化克隆不支持函数;渲染层只做展示与选择,
        // 扫描在主进程内跑,故出站前把 sessions 摘成 undefined(T6 口径 3)。
        def: { ...def, sessions: undefined },
        installed: resolved !== null,
        path: resolved ?? undefined
      }
    })
    return items
  })
}
