// settings 域薄编排层:T3 只读返回 → T11 增补写入 → T-R1/T-R6 单槽主题与原生控件着色
// 落盘沿用 T4 的整文件原子写(设置变更频率极低,不必防抖);
// nativeTheme.themeSource 与标题栏 overlay 颜色都按所选界面主题的 isDark / token 算(ADR-0009)。
import { ipcMain, nativeTheme, type BrowserWindow } from 'electron'
import { IPC_CHANNELS } from './channels'
import { saveStoreAtomic } from '../session-store/store-persistence'
import { TITLE_BAR_OVERLAY_HEIGHT, titleBarOverlayColorsForSettings } from '../app-window'
import type { AppStore, Settings } from '../../shared/types'
import { getAppTheme } from '../../shared/themes/resolve'

// 原生控件着色:标题栏 overlay(与渲染层顶栏同色)+ nativeTheme.themeSource。
// Why 由界面主题算而不读系统深浅(ADR-0009):应用不再跟随系统,themeSource 只作 `isDark ? 'dark' : 'light'`
// 的显式声明,让原生控件(overlay 按钮、系统滚动条)与页面一致;坏 id 由 getAppTheme 兜底为默认主题。
// 仅 win32/darwin 配置了 overlay(app-window 同判断),其余平台跳过 overlay 调用。
function syncNativeChrome(store: AppStore, getWindow: () => BrowserWindow | null): void {
  const theme = getAppTheme(store.settings)
  nativeTheme.themeSource = theme.isDark ? 'dark' : 'light'
  if (process.platform !== 'win32' && process.platform !== 'darwin') {
    return
  }
  const window = getWindow()
  if (!window || window.isDestroyed()) {
    return
  }
  window.setTitleBarOverlay({
    ...titleBarOverlayColorsForSettings(store.settings),
    height: TITLE_BAR_OVERLAY_HEIGHT
  })
}

// 值校验(T11 评审 Minor-3):settings 是 IPC 边界,坏值不得写进 store 或被当成主题生效。
// scrollback 与 types.ts 注释同口径([1, 50000],越界按边界收敛,非数字直接忽略该字段)。
// T11:终端 shell 三选一;非法值忽略(改了 shell 需要下次新建会话才生效,prompt 不受影响)
const SHELLS: ReadonlyArray<Settings['shell']> = ['cmd', 'powershell', 'pwsh']
const SCROLLBACK_MAX = 50_000

// T2 起导出供单测(模块行为接缝);仍然原地修改 settings,不抛出,坏值忽略或夹紧
export function applyPatch(settings: Settings, patch: Partial<Settings>): void {
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
  // —— 主题样式设置(T2 起):主题单槽(J-005)与字体族 ——
  // 两个主题字段只验类型(非空字符串),内容合法性交给渲染层 getAppTheme / getTerminalTheme 兜底
  if (typeof patch.appTheme === 'string' && patch.appTheme !== '') {
    settings.appTheme = patch.appTheme
  }
  if (typeof patch.terminalTheme === 'string' && patch.terminalTheme !== '') {
    settings.terminalTheme = patch.terminalTheme
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
      // 界面主题 → nativeTheme.themeSource(显式 dark/light)+ 标题栏 overlay 颜色
      syncNativeChrome(store, getWindow)
      await saveStoreAtomic(storePath, store)
      return store.settings
    }
  )

  // 启动即同步一次:上次退出时选的界面主题决定原生控件明暗与标题栏 overlay 颜色。
  // 不再监听 nativeTheme updated——应用不跟随系统,themeSource 恒为显式值,监听只会空转(ADR-0009)。
  syncNativeChrome(store, getWindow)
}
