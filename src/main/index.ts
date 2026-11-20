// 入口:窗口创建、IPC 装配、退出时清理(spec 模块划分:src/main/index.ts)
import { app, BrowserWindow } from 'electron'
import { join } from 'path'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { createAppWindow } from './app-window'
import { loadStore } from './session-store/store-persistence'
import { registerProjectsIpc } from './ipc/projects'

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.agent-sessions.app')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // store 文件路径由主进程决定(userData/store.json);store-persistence 只认传入路径
  const storePath = join(app.getPath('userData'), 'store.json')
  const store = await loadStore(storePath)
  registerProjectsIpc(store, storePath)

  createAppWindow()

  // On macOS it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createAppWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
