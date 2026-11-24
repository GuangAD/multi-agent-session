// 入口:窗口创建、IPC 装配、退出时清理(spec 模块划分:src/main/index.ts)
import { app, BrowserWindow } from 'electron'
import { join } from 'path'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { createAppWindow } from './app-window'
import './agents/plugins' // 插件清单装载(唯一登记点):必须先于任何用注册表的 IPC 装配
import { loadStore } from './session-store/store-persistence'
import { migrateLegacyStore } from './store-migration'
import { BackfillCoordinator } from './session-store/backfill'
import { registerProjectsIpc } from './ipc/projects'
import { registerAgentsIpc } from './ipc/agents'
import { registerSessionsIpc } from './ipc/sessions'
import { registerSettingsIpc } from './ipc/settings'
import { registerPtyIpc } from './ipc/pty'
import { registerStateIpc } from './ipc/state'
import { registerHooksIpc } from './ipc/hooks'
import { createInjector } from './agent-hooks/injector'
import { registerFilesIpc } from './ipc/files'
import { registerGitIpc } from './ipc/git'
import { ptyRegistry } from './pty-registry'

// 会话记录落盘器的退出前排空入口:由 registerSessionsIpc 在 whenReady 内装配后填入
let flushSessionRecords: () => Promise<void> = async () => {}
// 退出收尾阶段:done 后再次进入 before-quit 直接放行(app.quit() 会重入本 handler)
let quitPhase: 'idle' | 'cleaning' | 'done' = 'idle'

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.soloport.app')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // 产品名 2026-11-21 定为 Soloport(package.json name 同步),userData 随之变为
  // %APPDATA%/Soloport;用户已有的真实记录在旧目录 %APPDATA%/agent-sessions。
  // Why 一次性搬运:改名不能吞掉用户已有项目/会话/设置,故新目录无 store.json 时从旧目录复制一份
  // (旧目录保留不删——出错可回退;复制而非搬移也避免迁移中途失败丢数据)。
  // 产品名改名的数据搬迁(实现在 store-migration.ts,有单测):失败不阻塞启动
  const migration = await migrateLegacyStore(
    app.getPath('userData'),
    join(app.getPath('appData'), 'agent-sessions')
  )
  // new-exists(已在新目录工作过)与 legacy-missing(全新安装)都是正常终态,不刷日志;
  // 只有复制失败需要留痕(此时新目录拿不到记录,旧文件仍在原处可人工处理)
  if (migration.reason === 'copy-failed') {
    console.error('旧数据目录迁移失败(旧文件仍在原处):', migration.error)
  }

  // store 文件路径由主进程决定(userData/store.json);store-persistence 只认传入路径
  const storePath = join(app.getPath('userData'), 'store.json')
  const store = await loadStore(storePath)
  // hook-run-state T3:注入器(启动 reconcile;spawn 前自愈经 ipc/pty;项目增删联动经 ipc/projects)
  const injector = createInjector({ store, scriptsDir: join(app.getPath('userData'), 'hook-scripts') })
  void injector.reconcile()
  registerProjectsIpc(store, storePath, injector)
  registerAgentsIpc()
  // T8:防抖落盘器从 sessions IPC 层导出,入口组合转交 ipc/pty.ts(回填写回用;不跨域 import)
  const sessionsIpc = registerSessionsIpc(store, storePath)
  flushSessionRecords = sessionsIpc.flush
  // T11:settings 写入需要窗口(切换 nativeTheme 后同步标题栏 overlay 配色)与落盘路径
  registerSettingsIpc(store, () => BrowserWindow.getAllWindows()[0] ?? null, storePath)
  // 单窗口应用:事件出站直接取当前窗口(无窗口时不发)
  registerPtyIpc(store, sessionsIpc.scheduleSave, () => BrowserWindow.getAllWindows()[0] ?? null, injector)
  // 状态引擎编排(三源喂食 + state:changed 广播):订阅注册表的 data/exit,与会话记录同源取 agentId
  registerStateIpc(store, () => BrowserWindow.getAllWindows()[0] ?? null)
  registerHooksIpc(injector)
  // T9:文件浏览三通道(无 store/窗口依赖,装配不传参)
  registerFilesIpc()
  registerGitIpc()

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
    // T8:先停掉在途回填轮询(以 null 收场,不再扫描/写回),再排空落盘——
    // 排空才能捕获轮询最后写回的 externalSessionId
    BackfillCoordinator.releaseAll()
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
