// sessions 域薄编排层:T3 最小实现——构造 Session 返回渲染层,不写 store
// (controller 口径 2:会话记录持久化 CRUD 是 T4;主进程不持有该记录,内存态归渲染层 sessions-slice)
import { randomUUID } from 'node:crypto'
import { ipcMain } from 'electron'
import { IPC_CHANNELS } from './channels'
import { agentRegistry } from '../agents/agent-registry'
import type { AgentId, ProjectId, Session } from '../../shared/types'

export function registerSessionsIpc(): void {
  ipcMain.handle(
    IPC_CHANNELS.sessionsCreate,
    (_event, p: { projectId: ProjectId; agentId: AgentId }): Session => {
      // agentId 支持别名(kimi-code),归一后落规范 id 与显示名
      const def = agentRegistry.getById(p.agentId)
      if (!def) {
        throw new Error(`未知 agent:${p.agentId}`)
      }
      return {
        id: randomUUID(),
        projectId: p.projectId,
        agentId: def.id,
        title: def.name,
        createdAt: new Date().toISOString(),
        origin: 'created'
      }
    }
  )
}
