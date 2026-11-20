// settings 域薄编排层:T3 只读返回(store 由入口装配传入,设置界面属后续任务)
import { ipcMain } from 'electron'
import { IPC_CHANNELS } from './channels'
import type { AppStore } from '../../shared/types'

export function registerSettingsIpc(store: AppStore): void {
  ipcMain.handle(IPC_CHANNELS.settingsGet, () => store.settings)
}
