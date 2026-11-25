// 终端主题、界面主题与外观解析:纯函数,构造与运行时更新共用这一个来源(T3;T-R3 起主题单槽)。
// 出错约定:不抛出;主题 id / 名称不在目录时落默认主题,越界值夹紧,坏枚举落默认值。
import type { ITheme } from '@xterm/xterm'
import { TERMINAL_THEMES } from './catalog'
import { APP_THEMES, DEFAULT_APP_THEME_ID, type AppTheme } from './app-themes'
import { DEFAULT_FONT_FALLBACK_CHAIN } from './fonts'
import type { Settings } from '../types'

// 默认终端配色名(spec 数据结构节):坏名兜底与主进程 store 默认值的唯一来源
export const DEFAULT_TERMINAL_THEME_NAME = 'Ghostty Default Style Dark'

// 界面侧坏 id 兜底套(T-R3):APP_THEMES 一定含默认 id,故非空断言安全
const DEFAULT_APP_THEME = APP_THEMES.find((theme) => theme.id === DEFAULT_APP_THEME_ID)!

// 设置 → 界面主题(整套 token + isDark)。坏 id / 空串 / 目录外一律落默认套:兜底唯一落点。
export function getAppTheme(settings: Pick<Settings, 'appTheme'>): AppTheme {
  return APP_THEMES.find((theme) => theme.id === settings.appTheme) ?? DEFAULT_APP_THEME
}

// 设置 → 终端配色;坏名落默认深色主题(与 getAppTheme 同口径)
export function getTerminalTheme(settings: Pick<Settings, 'terminalTheme'>): ITheme {
  return TERMINAL_THEMES[settings.terminalTheme] ?? TERMINAL_THEMES[DEFAULT_TERMINAL_THEME_NAME]
}

// 设置 → xterm 全量外观,输出可直接展开进 Terminal options
export type TerminalAppearance = {
  fontFamily: string
  fontSize: number
  fontWeight: number
  fontWeightBold: number
  lineHeight: number
  cursorStyle: 'block' | 'bar' | 'underline'
  cursorBlink: boolean
  theme: ITheme
  scrollback: number
}

// 字号/行高边界(spec 数据结构节注释):越界夹紧
const FONT_SIZE_MIN = 8
const FONT_SIZE_MAX = 32
const LINE_HEIGHT_MIN = 1.0
const LINE_HEIGHT_MAX = 2.0

const CURSOR_STYLES: Settings['terminalCursorStyle'][] = ['block', 'bar', 'underline']

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

// 字体链:选了具体字体 → 带引号插链首,原链逐字保留;缺省(含空串)→ 默认回退链
function resolveFontFamily(terminalFontFamily: Settings['terminalFontFamily']): string {
  if (!terminalFontFamily) {
    return DEFAULT_FONT_FALLBACK_CHAIN
  }
  return `"${terminalFontFamily}", ${DEFAULT_FONT_FALLBACK_CHAIN}`
}

// 字段独立映射;加粗字重不出设置,固定 500(use-terminal 现状值)
export function resolveTerminalAppearance(settings: Settings): TerminalAppearance {
  return {
    fontFamily: resolveFontFamily(settings.terminalFontFamily),
    fontSize: clamp(settings.terminalFontSize, FONT_SIZE_MIN, FONT_SIZE_MAX),
    fontWeight: settings.terminalFontWeight,
    fontWeightBold: 500,
    lineHeight: clamp(settings.terminalLineHeight, LINE_HEIGHT_MIN, LINE_HEIGHT_MAX),
    cursorStyle: CURSOR_STYLES.includes(settings.terminalCursorStyle) ? settings.terminalCursorStyle : 'block',
    cursorBlink: settings.terminalCursorBlink,
    theme: getTerminalTheme(settings),
    scrollback: settings.scrollbackRows
  }
}
