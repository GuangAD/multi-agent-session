// pty 域薄编排层:spawn/write/resize/kill 透传注册表;data/exit 事件推渲染层
// (样板同 ipc/projects.ts;窗口经注入的取窗函数拿,便于单窗口应用跟随重建)
import { ipcMain, type BrowserWindow } from 'electron'
import { IPC_CHANNELS } from './channels'
import { ptyRegistry } from '../pty-registry'
import { agentRegistry } from '../agents/agent-registry'
import type { PtyDataEvent, PtyExitEvent } from '../../shared/ipc-contract'
import type { AgentId, SessionId } from '../../shared/types'

function sendToRenderer(
  getWindow: () => BrowserWindow | null,
  channel: string,
  payload: PtyDataEvent | PtyExitEvent
): void {
  const window = getWindow()
  if (window && !window.isDestroyed()) {
    window.webContents.send(channel, payload)
  }
}

export function registerPtyIpc(getWindow: () => BrowserWindow | null): void {
  ipcMain.handle(
    IPC_CHANNELS.ptySpawn,
    async (_event, p: { sessionId: SessionId; agentId: AgentId; cwd: string }): Promise<void> => {
      // agentId 支持别名(kimi-code),经注册表归一后取定义
      const def = agentRegistry.getById(p.agentId)
      if (!def) {
        throw new Error(`未知 agent:${p.agentId}`)
      }
      await ptyRegistry.spawn({ sessionId: p.sessionId, def, cwd: p.cwd })
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.ptyWrite,
    (_event, p: { sessionId: SessionId; data: string }): void => {
      ptyRegistry.write(p.sessionId, p.data)
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.ptyResize,
    (_event, p: { sessionId: SessionId; cols: number; rows: number }): void => {
      ptyRegistry.resize(p.sessionId, p.cols, p.rows)
    }
  )

  ipcMain.handle(IPC_CHANNELS.ptyKill, (_event, sessionId: SessionId): void => {
    ptyRegistry.kill(sessionId)
  })

  // 事件出站:注册表 → 渲染层(退订函数在单窗口应用生命周期内不需调用)
  ptyRegistry.onData((event) => {
    sendToRenderer(getWindow, IPC_CHANNELS.ptyData, event)
  })
  ptyRegistry.onExit((event) => {
    sendToRenderer(getWindow, IPC_CHANNELS.ptyExit, event)
  })
}
