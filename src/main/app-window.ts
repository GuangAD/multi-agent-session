// 主窗口创建与状态(spec 模块划分:src/main/app-window.ts)
import { BrowserWindow, shell } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { getAppTheme } from '../shared/themes/resolve'
import type { Settings } from '../shared/types'

// 标题栏 overlay 配色与高度(单一来源):窗口创建与运行期切换主题都用这一份,
// 避免 app-window 与 ipc/settings 各写一套色值而漂移(T11 评审 Minor-5)
// 32 = Windows 系统标题栏标准高度;须小于渲染层顶栏的 h-9(36px),让底线落在
// 系统控件覆盖层之外——覆盖层高 36 时恰好盖住 border-b,标题栏横线右侧断 172px
export const TITLE_BAR_OVERLAY_HEIGHT = 32

// 标题栏 overlay 跟随**界面主题**:overlay 是 Electron 自己绘制在窗口上的系统按钮区,
// 不随页面 CSS 变,只按系统明暗算的话换主题后右上角与页面顶栏脱节(冒烟反馈)。
// 主题色值在 shared/themes(主进程可直接 import),与渲染层同一份解析;坏 id 由 getAppTheme 兜底。
export function titleBarOverlayColorsForSettings(settings: Settings): { color: string; symbolColor: string } {
  const { tokens } = getAppTheme(settings)
  return { color: tokens.base, symbolColor: tokens.ink }
}

// settings 必传(评审 C1):窗口一创建就按**已保存的主题**着色。此前按默认主题硬着色,
// 而 registerSettingsIpc 注册时窗口还不存在(那次 overlay 同步是空操作),导致浅色主题用户
// 每次冷启动都看到深色系统按钮区,直到改任意设置才纠正。
export function createAppWindow(settings: Settings): BrowserWindow {
  // 与运行期同步走同一个映射函数(单一来源,避免建窗路径另写一套色值;复审 P2-4)
  const overlay = titleBarOverlayColorsForSettings(settings)
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    // 自定义标题栏(2026-11-21 用户要求):面板入口(文件/Git)常驻标题栏,不再单占一行。
    // titleBarStyle: 'hidden' 隐藏系统标题栏文字,titleBarOverlay 保留系统最小化/最大化/关闭按钮
    // 并让出右侧一段区域;渲染层的顶栏即窗口标题栏(-webkit-app-region: drag)。
    // 颜色取当前界面主题(单槽),首帧即按已保存设置着色;此后设置在运行期变更由 ipc/settings 同步。
    ...(process.platform === 'win32' || process.platform === 'darwin'
      ? {
          titleBarStyle: 'hidden' as const,
          titleBarOverlay: {
            color: overlay.color,
            symbolColor: overlay.symbolColor,
            height: TITLE_BAR_OVERLAY_HEIGHT
          }
        }
      : {}),
    // 窗口图标:Linux 用 png;Windows 开发期任务栏也用它(打包后 exe 内嵌 icon.ico,
    // 由 electron-builder win.icon 决定)
    ...(process.platform === 'linux' || process.platform === 'win32' ? { icon } : {}),
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
