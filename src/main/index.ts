// 入口:窗口创建、IPC 装配、退出时清理(spec 模块划分:src/main/index.ts)
import { app, BrowserWindow } from 'electron'
import { join } from 'path'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { createAppWindow } from './app-window'
import { loadStore } from './session-store/store-persistence'
import { registerProjectsIpc } from './ipc/projects'
import { registerAgentsIpc } from './ipc/agents'
import { registerSessionsIpc } from './ipc/sessions'
import { registerSettingsIpc } from './ipc/settings'
import { registerPtyIpc } from './ipc/pty'
import { registerStateIpc } from './ipc/state'
import { ptyRegistry } from './pty-registry'

// 会话记录落盘器的退出前排空入口:由 registerSessionsIpc 在 whenReady 内装配后填入
let flushSessionRecords: () => Promise<void> = async () => {}
// 退出收尾阶段:done 后再次进入 before-quit 直接放行(app.quit() 会重入本 handler)
let quitPhase: 'idle' | 'cleaning' | 'done' = 'idle'

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
  registerAgentsIpc()
  flushSessionRecords = registerSessionsIpc(store, storePath).flush
  registerSettingsIpc(store)
  // 单窗口应用:事件出站直接取当前窗口(无窗口时不发)
  registerPtyIpc(() => BrowserWindow.getAllWindows()[0] ?? null)
  // 状态引擎编排(三源喂食 + state:changed 广播):订阅注册表的 data/exit,与会话记录同源取 agentId
  registerStateIpc(store, () => BrowserWindow.getAllWindows()[0] ?? null)

  createAppWindow()

  // On macOS it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createAppWindow()
  })
})

// 应用退出全量清理:比 window-all-closed 更早且覆盖 Cmd+Q,不留孤儿 PTY(controller 口径 5)
// Why: 会话记录是 100ms 尾沿防抖落盘,删除/重命名后立刻退出会丢掉最后一次变更(重启后已删会话
// 复活、重命名回退);故先排空落盘再杀 PTY。收尾是异步的,先 preventDefault 拦住本次退出,
// 收尾完成后再 app.quit()(那时 quitPhase 已置 done,重入本 handler 直接放行,不成死循环)。
app.on('before-quit', (event) => {
  if (quitPhase === 'done') {
    return
  }
  event.preventDefault()
  if (quitPhase === 'cleaning') {
    return // 收尾进行中(期间再次触发退出):等第一次收尾完成,不重复执行
  }
  quitPhase = 'cleaning'
  void (async () => {
    await flushSessionRecords()
    ptyRegistry.killAll()
    quitPhase = 'done'
    app.quit()
  })()
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
