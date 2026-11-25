// app-themes 目录完整性测试(T-R2,spec 接缝四「界面目录」行):
// 恰 12 套 × 1 形态 × 10 token 齐、id 唯一且属联合类型、色值 #rrggbb;
// 并用显式 id 清单钉住「深 5 / 浅 7」的分组与顺序(下拉顺序即数组顺序)。
import { describe, expect, it } from 'vitest'
import { APP_THEMES, DEFAULT_APP_THEME_ID, type AppThemeId, type AppTokenValues } from './app-themes'

// 10 个语义 token(spec 数据结构节 AppTokenValues),与 theme-tokens.css 的 --app-* 一一对应
const TOKEN_KEYS: Array<keyof AppTokenValues> = [
  'base',
  'panel',
  'surface',
  'line',
  'ink',
  'inkMuted',
  'accent',
  'onAccent',
  'hover',
  'accentHover'
]

// #rrggbb 格式约定(色值表全部为该形态)
const HEX_RGB = /^#[0-9a-f]{6}$/

// 联合类型的全部成员:目录必须与它一一对应(不多、不少、不重)
const DARK_IDS: AppThemeId[] = [
  'github-dark',
  'github-dark-hc',
  'vscode-dark-modern',
  'carbonfox',
  'tango-dark'
]
const LIGHT_IDS: AppThemeId[] = [
  'vscode-light',
  'github-light',
  'gruvbox-light-hard',
  'selenized-white',
  'tango-light',
  'flexoki-light',
  'tomorrow'
]

describe('APP_THEMES 界面主题目录(模块完整性)', () => {
  it('用例 1:恰 12 套、id 唯一、每套 10 token 齐且色值 #rrggbb', () => {
    expect(APP_THEMES).toHaveLength(12)
    const ids = APP_THEMES.map((theme) => theme.id)
    expect(new Set(ids).size, 'id 必须唯一').toBe(12)
    expect([...ids].sort()).toEqual([...DARK_IDS, ...LIGHT_IDS].sort())
    for (const theme of APP_THEMES) {
      expect(theme.name.length, `${theme.id} 必须有展示名`).toBeGreaterThan(0)
      for (const key of TOKEN_KEYS) {
        expect(theme.tokens[key], `${theme.id}.${key} 必须是 #rrggbb`).toMatch(HEX_RGB)
      }
    }
  })

  it('用例 2:深色 5 套 / 浅色 7 套与 isDark 完全对应,顺序深前浅后;默认 id 在目录内', () => {
    const darkIds = APP_THEMES.filter((theme) => theme.isDark).map((theme) => theme.id)
    const lightIds = APP_THEMES.filter((theme) => !theme.isDark).map((theme) => theme.id)
    expect(darkIds).toEqual(DARK_IDS)
    expect(lightIds).toEqual(LIGHT_IDS)
    // 深色在前浅色在后:界面主题下拉直接按数组顺序分组,不需要再排序
    expect(APP_THEMES.map((theme) => theme.id)).toEqual([...DARK_IDS, ...LIGHT_IDS])
    expect(DEFAULT_APP_THEME_ID).toBe('github-dark')
    expect(APP_THEMES.some((theme) => theme.id === DEFAULT_APP_THEME_ID)).toBe(true)
  })
})
