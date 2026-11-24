// hooks 域薄编排层:显式移除全部 managed 注入(hook-run-state T3)
// 注入器实例由入口装配处注入(沿 T8 裁决 4:不跨域 import,组合在 IPC 层)
import { ipcMain } from 'electron'
import { IPC_CHANNELS } from './channels'
import type { Injector } from '../agent-hooks/injector'

export function registerHooksIpc(injector: Injector): void {
  ipcMain.handle(IPC_CHANNELS.hooksRemove, (): void => {
    injector.removeAll()
  })
}
