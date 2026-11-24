// 终端主题与外观解析:纯函数,构造与运行时更新共用这一个来源(T3 契约)。
// 出错约定:不抛出;槽 id 不在目录落默认主题,越界值夹紧,坏枚举落默认值。
import type { ITheme } from '@xterm/xterm'
import { TERMINAL_THEMES } from './catalog'
import { DEFAULT_FONT_FALLBACK_CHAIN } from './fonts'
import type { Settings } from '../types'

// 深浅默认主题(spec 数据结构节):坏 id 兜底的唯一落点
const DEFAULT_DARK_THEME_ID = 'Ghostty Default Style Dark'
const DEFAULT_LIGHT_THEME_ID = 'Builtin Tango Light'

// 三态 + 系统深浅 + 双槽 → 当前应套用的终端主题;theme 字段永远可用
export function selectTerminalTheme(
  settings: Pick<Settings, 'theme' | 'terminalThemeDark' | 'terminalThemeLight'>,
  systemDark: boolean
): { mode: 'dark' | 'light'; theme: ITheme } {
  const mode: 'dark' | 'light' =
    settings.theme === 'dark'
      ? 'dark'
      : settings.theme === 'light' || (settings.theme === 'system' && !systemDark)
        ? 'light'
        : 'dark'
  const requestedId = mode === 'dark' ? settings.terminalThemeDark : settings.terminalThemeLight
  const theme = TERMINAL_THEMES[requestedId] ?? TERMINAL_THEMES[mode === 'dark' ? DEFAULT_DARK_THEME_ID : DEFAULT_LIGHT_THEME_ID]
  return { mode, theme }
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
export function resolveTerminalAppearance(settings: Settings, systemDark: boolean): TerminalAppearance {
  return {
    fontFamily: resolveFontFamily(settings.terminalFontFamily),
    fontSize: clamp(settings.terminalFontSize, FONT_SIZE_MIN, FONT_SIZE_MAX),
    fontWeight: settings.terminalFontWeight,
    fontWeightBold: 500,
    lineHeight: clamp(settings.terminalLineHeight, LINE_HEIGHT_MIN, LINE_HEIGHT_MAX),
    cursorStyle: CURSOR_STYLES.includes(settings.terminalCursorStyle) ? settings.terminalCursorStyle : 'block',
    cursorBlink: settings.terminalCursorBlink,
    theme: selectTerminalTheme(settings, systemDark).theme,
    scrollback: settings.scrollbackRows
  }
}
