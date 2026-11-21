// 主窗口创建与状态(spec 模块划分:src/main/app-window.ts)
import { BrowserWindow, nativeTheme, shell } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'

export function createAppWindow(): BrowserWindow {
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    // 自定义标题栏(2026-11-21 用户要求):面板入口(文件/Git)常驻标题栏,不再单占一行。
    // titleBarStyle: 'hidden' 隐藏系统标题栏文字,titleBarOverlay 保留系统最小化/最大化/关闭按钮
    // 并让出右侧一段区域;渲染层的顶栏即窗口标题栏(-webkit-app-region: drag)。
    // 颜色跟随系统主题(nativeTheme);T11 接手动主题切换时改用 win.setTitleBarOverlay 同步。
    ...(process.platform === 'win32' || process.platform === 'darwin'
      ? {
          titleBarStyle: 'hidden' as const,
          titleBarOverlay: {
            color: nativeTheme.shouldUseDarkColors ? '#18181b' : '#ffffff',
            symbolColor: nativeTheme.shouldUseDarkColors ? '#e4e4e7' : '#3f3f46',
            height: 36
          }
        }
      : {}),
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // 开发期走 electron-vite 的 HMR URL,生产加载本地文件(模板既有逻辑)
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return mainWindow
}
