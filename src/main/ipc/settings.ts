// settings 域薄编排层:T3 只读返回(T3)→ T11 增补写入(主题三态)
// 落盘沿用 T4 的整文件原子写(设置变更频率极低,不必防抖);主题同时同步到 nativeTheme,
// 让系统控件(标题栏 overlay 的按钮颜色)与页面一致。
import { ipcMain, nativeTheme, type BrowserWindow } from 'electron'
import { IPC_CHANNELS } from './channels'
import { saveStoreAtomic } from '../session-store/store-persistence'
import { TITLE_BAR_OVERLAY_HEIGHT, titleBarOverlayColors } from '../app-window'
import type { AppStore, Settings } from '../../shared/types'

// 标题栏 overlay 配色:与渲染层顶栏同色(取 app-window 的单一来源)。
// Why 在这里同步:overlay 是 Electron 自己绘制在窗口上的系统按钮,不随页面 CSS 变;
// T10 用 nativeTheme 初值,手动切主题后必须显式改,否则深色主题下按钮仍是深色(看不见)。
// 仅 win32/darwin 配置了 overlay(app-window 同判断),其余平台调用是无对应物件的空路径。
function syncTitleBarOverlay(getWindow: () => BrowserWindow | null): void {
  if (process.platform !== 'win32' && process.platform !== 'darwin') {
    return
  }
  const window = getWindow()
  if (!window || window.isDestroyed()) {
    return
  }
  window.setTitleBarOverlay({
    ...titleBarOverlayColors(nativeTheme.shouldUseDarkColors),
    height: TITLE_BAR_OVERLAY_HEIGHT
  })
}

// 值校验(T11 评审 Minor-3):settings 是 IPC 边界,坏值不得写进 store 或被当成主题生效。
// 主题必须三态之一;scrollback 与 types.ts 注释同口径([1, 50000],越界按边界收敛,
// 非数字直接忽略该字段)。
const THEMES: ReadonlyArray<Settings['theme']> = ['system', 'light', 'dark']
// T11:终端 shell 三选一;非法值忽略(改了 shell 需要下次新建会话才生效,prompt 不受影响)
const SHELLS: ReadonlyArray<Settings['shell']> = ['cmd', 'powershell', 'pwsh']
const SCROLLBACK_MAX = 50_000

// T2 起导出供单测(模块行为接缝);仍然原地修改 settings,不抛出,坏值忽略或夹紧
export function applyPatch(settings: Settings, patch: Partial<Settings>): void {
  if (patch.theme !== undefined && THEMES.includes(patch.theme)) {
    settings.theme = patch.theme
  }
  if (typeof patch.scrollbackRows === 'number' && Number.isFinite(patch.scrollbackRows)) {
    settings.scrollbackRows = Math.min(
      SCROLLBACK_MAX,
      Math.max(1, Math.trunc(patch.scrollbackRows))
    )
  }
  if (patch.shell !== undefined && SHELLS.includes(patch.shell)) {
    settings.shell = patch.shell
  }
  if (patch.defaultAgentId !== undefined) {
    settings.defaultAgentId = patch.defaultAgentId
  }
  // —— 主题样式设置(T2)新增字段 ——
  // 主题槽与字体族:只验类型,内容合法性交给渲染层解析兜底(坏 id 落默认主题)
  if (typeof patch.appThemeDark === 'string' && patch.appThemeDark !== '') {
    settings.appThemeDark = patch.appThemeDark
  }
  if (typeof patch.appThemeLight === 'string' && patch.appThemeLight !== '') {
    settings.appThemeLight = patch.appThemeLight
  }
  if (typeof patch.terminalThemeDark === 'string' && patch.terminalThemeDark !== '') {
    settings.terminalThemeDark = patch.terminalThemeDark
  }
  if (typeof patch.terminalThemeLight === 'string' && patch.terminalThemeLight !== '') {
    settings.terminalThemeLight = patch.terminalThemeLight
  }
  if (typeof patch.terminalFontFamily === 'string') {
    settings.terminalFontFamily = patch.terminalFontFamily
  }
  if (typeof patch.terminalFontSize === 'number' && Number.isFinite(patch.terminalFontSize)) {
    settings.terminalFontSize = Math.min(32, Math.max(8, Math.trunc(patch.terminalFontSize)))
  }
  if (
    patch.terminalFontWeight === 300 ||
    patch.terminalFontWeight === 400 ||
    patch.terminalFontWeight === 500
  ) {
    settings.terminalFontWeight = patch.terminalFontWeight
  }
  if (typeof patch.terminalLineHeight === 'number' && Number.isFinite(patch.terminalLineHeight)) {
    settings.terminalLineHeight =
      Math.round(Math.min(2, Math.max(1, patch.terminalLineHeight)) * 10) / 10
  }
  if (
    patch.terminalCursorStyle === 'block' ||
    patch.terminalCursorStyle === 'bar' ||
    patch.terminalCursorStyle === 'underline'
  ) {
    settings.terminalCursorStyle = patch.terminalCursorStyle
  }
  if (typeof patch.terminalCursorBlink === 'boolean') {
    settings.terminalCursorBlink = patch.terminalCursorBlink
  }
}

export function registerSettingsIpc(
  store: AppStore,
  getWindow: () => BrowserWindow | null,
  // 必填(T11 评审 Minor-8):不传就静默不落盘会把「是否持久化」变成调用点的隐含约定
  storePath: string
): void {
  ipcMain.handle(IPC_CHANNELS.settingsGet, () => store.settings)

  ipcMain.handle(
    IPC_CHANNELS.settingsSet,
    async (_event, patch: Partial<Settings>): Promise<Settings> => {
      applyPatch(store.settings, patch)
      // nativeTheme.themeSource 同时决定 shouldUseDarkColors:'system' 跟随系统,
      // 'dark'/'light' 强制——这正是渲染层需要的解析结果来源,一套语义两处使用
      nativeTheme.themeSource = store.settings.theme
      syncTitleBarOverlay(getWindow)
      await saveStoreAtomic(storePath, store)
      return store.settings
    }
  )

  // 启动即同步一次(上次退出时可能是强制主题)
  nativeTheme.themeSource = store.settings.theme
  nativeTheme.on('updated', () => syncTitleBarOverlay(getWindow))
}
