// app-themes 目录完整性测试(T4 用例 7,spec 接缝四「界面目录」行):
// 恰 8 套 × 深浅两形态、9 token 齐、色值 #rrggbb。期望值来源:T4 契约「数据结构」色值表 + 色值格式约定。
import { describe, expect, it } from 'vitest'
import { APP_THEMES, type AppThemeId, type AppTokenValues } from './app-themes'

// 9 个语义 token(spec 数据结构节 AppTokenValues),与 theme-tokens.css 的 --app-* 一一对应
const TOKEN_KEYS: Array<keyof AppTokenValues> = [
  'base',
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
const ALL_IDS: AppThemeId[] = [
  'default',
  'warm',
  'cool',
  'forest',
  'purple-night',
  'rose',
  'dusk',
  'ember'
]

describe('APP_THEMES 界面主题目录(模块完整性)', () => {
  it('用例 7:恰 8 套、id 唯一且属联合类型、每套深浅两形态 9 token 齐且色值 #rrggbb', () => {
    expect(APP_THEMES).toHaveLength(8)
    const ids = APP_THEMES.map((theme) => theme.id)
    expect(new Set(ids).size, 'id 必须唯一').toBe(8)
    expect([...ids].sort()).toEqual([...ALL_IDS].sort())
    for (const theme of APP_THEMES) {
      for (const form of [theme.light, theme.dark]) {
        for (const key of TOKEN_KEYS) {
          expect(form[key], `${theme.id}.${key} 必须是 #rrggbb`).toMatch(HEX_RGB)
        }
      }
    }
  })
})
