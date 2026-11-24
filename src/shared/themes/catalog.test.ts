import { describe, expect, it } from 'vitest'
import type { ITheme } from '@xterm/xterm'
import { TERMINAL_THEMES } from './catalog'

// 契约名单(T3「数据结构」节):恰 22 套,深 13 + 浅 9;完整性断言以此名单为准
const DARK_THEME_NAMES = [
  'Ghostty Default Style Dark',
  'One Dark',
  'Tokyo Night',
  'Gruvbox Dark',
  'Catppuccin Mocha',
  'Solarized Dark',
  'Material Dark',
  'Ayu Dark',
  'Rose Pine',
  'Everforest Dark',
  'Horizon Dark',
  'Night Owl',
  'Tango Dark'
] as const

const LIGHT_THEME_NAMES = [
  'Builtin Tango Light',
  'Solarized Light',
  'One Light',
  'Catppuccin Latte',
  'GitHub Light',
  'Rose Pine Dawn',
  'Gruvbox Light',
  'Tokyo Night Light',
  'Everforest Light'
] as const

// ITheme 必需键:背景/前景/光标/选区 + 16 色 ANSI 调色(与移植源逐套形状一致)
const REQUIRED_THEME_KEYS: (keyof ITheme)[] = [
  'background',
  'foreground',
  'cursor',
  'cursorAccent',
  'selectionBackground',
  'selectionForeground',
  'black',
  'red',
  'green',
  'yellow',
  'blue',
  'magenta',
  'cyan',
  'white',
  'brightBlack',
  'brightRed',
  'brightGreen',
  'brightYellow',
  'brightBlue',
  'brightMagenta',
  'brightCyan',
  'brightWhite'
]

describe('TERMINAL_THEMES 目录完整性', () => {
  it('恰 22 套,契约名单逐套在册,必需键齐,色值一律 #rrggbb', () => {
    const expectedNames: readonly string[] = [...DARK_THEME_NAMES, ...LIGHT_THEME_NAMES]
    const missing = expectedNames.filter((name) => TERMINAL_THEMES[name] === undefined)
    expect(missing, `缺 ${missing.length} 套:${missing.join('、')}`).toEqual([])
    expect(Object.keys(TERMINAL_THEMES)).toHaveLength(expectedNames.length)

    for (const name of expectedNames) {
      const theme: ITheme = TERMINAL_THEMES[name]
      for (const key of REQUIRED_THEME_KEYS) {
        expect(theme[key], `${name} 缺键 ${String(key)}`).toBeDefined()
        expect(theme[key], `${name}.${String(key)} 非十六进制色值`).toMatch(/^#[0-9a-f]{6}$/)
      }
    }
  })
})
