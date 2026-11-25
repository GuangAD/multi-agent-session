import { describe, expect, it } from 'vitest'
import type { Settings } from '../types'
import { DEFAULT_FONT_FALLBACK_CHAIN } from './fonts'
import { TERMINAL_THEMES } from './catalog'
import { APP_THEMES, DEFAULT_APP_THEME_ID } from './app-themes'

// 设置工厂:非本接缝字段落 DEFAULT_STORE 同款默认值(spec 数据结构节),用例只覆写关注字段
const makeSettings = (overrides: Partial<Settings> = {}): Settings => ({
  scrollbackRows: 10000,
  appTheme: 'github-dark',
  terminalTheme: 'Ghostty Default Style Dark',
  shell: 'powershell',
  terminalFontSize: 14,
  terminalFontWeight: 300,
  terminalLineHeight: 1.0,
  terminalCursorStyle: 'block',
  terminalCursorBlink: false,
  ...overrides
})

describe('getAppTheme(界面主题选择解析:单槽,坏 id 落默认)', () => {
  it('用例 1:appTheme=carbonfox → 返回该套,isDark=true,token 与目录一致', async () => {
    const { getAppTheme } = await import('./resolve')
    const theme = getAppTheme({ appTheme: 'carbonfox' })
    expect(theme.id).toBe('carbonfox')
    expect(theme.isDark).toBe(true)
    expect(theme.tokens).toBe(APP_THEMES.find((candidate) => candidate.id === 'carbonfox')!.tokens)
  })

  it('用例 2:坏 id 与空串 → 落默认套 github-dark', async () => {
    const { getAppTheme } = await import('./resolve')
    expect(getAppTheme({ appTheme: 'nope' }).id).toBe(DEFAULT_APP_THEME_ID)
    expect(getAppTheme({ appTheme: '' }).id).toBe(DEFAULT_APP_THEME_ID)
    // 旧目录 id 也落默认(旧 store.json 迁移后的残留值走这条路径)
    expect(getAppTheme({ appTheme: 'warm' }).id).toBe(DEFAULT_APP_THEME_ID)
  })

  it('用例 3:isDark 与 token 组一致——深色套的 base 明度低于 ink,浅色套相反', async () => {
    const { getAppTheme } = await import('./resolve')
    for (const candidate of APP_THEMES) {
      const theme = getAppTheme({ appTheme: candidate.id })
      const luminance = (hex: string): number => parseInt(hex.slice(1, 3), 16) + parseInt(hex.slice(3, 5), 16) + parseInt(hex.slice(5, 7), 16)
      const baseIsDark = luminance(theme.tokens.base) < luminance(theme.tokens.ink)
      expect(baseIsDark, `${theme.id} 的 base 与 ink 明度关系应与 isDark 一致`).toBe(theme.isDark)
    }
  })
})

describe('getTerminalTheme(终端配色选择解析:单槽,坏名落默认)', () => {
  it('用例 4:目录内名字原样返回', async () => {
    const { getTerminalTheme } = await import('./resolve')
    expect(getTerminalTheme({ terminalTheme: 'Builtin Tango Light' })).toBe(
      TERMINAL_THEMES['Builtin Tango Light']
    )
  })

  it('用例 5:目录外名字与空串 → 落默认 Ghostty 深色', async () => {
    const { getTerminalTheme } = await import('./resolve')
    expect(getTerminalTheme({ terminalTheme: 'Nope Dark' })).toBe(
      TERMINAL_THEMES['Ghostty Default Style Dark']
    )
    expect(getTerminalTheme({ terminalTheme: '' })).toBe(TERMINAL_THEMES['Ghostty Default Style Dark'])
  })
})

describe('resolveTerminalAppearance(终端外观解析:字段独立映射 + 夹紧,无 systemDark 维度)', () => {
  it('用例 6:terminalFontFamily 缺省 → 输出完整默认回退链;scrollback 直通', async () => {
    const { resolveTerminalAppearance } = await import('./resolve')
    const appearance = resolveTerminalAppearance(makeSettings({ scrollbackRows: 20000 }))
    expect(appearance.fontFamily).toBe(DEFAULT_FONT_FALLBACK_CHAIN)
    expect(appearance.scrollback).toBe(20000)
  })

  it('用例 7:terminalFontFamily=JetBrains Mono → 链首插入带引号名字,其后原链逐字保留', async () => {
    const { resolveTerminalAppearance } = await import('./resolve')
    const appearance = resolveTerminalAppearance(makeSettings({ terminalFontFamily: 'JetBrains Mono' }))
    expect(appearance.fontFamily).toBe(`"JetBrains Mono", ${DEFAULT_FONT_FALLBACK_CHAIN}`)
  })

  it('用例 8:fontSize 3 / 99 → 夹紧 8 / 32', async () => {
    const { resolveTerminalAppearance } = await import('./resolve')
    expect(resolveTerminalAppearance(makeSettings({ terminalFontSize: 3 })).fontSize).toBe(8)
    expect(resolveTerminalAppearance(makeSettings({ terminalFontSize: 99 })).fontSize).toBe(32)
  })

  it('用例 9:lineHeight 0.5 / 3 → 夹紧 1.0 / 2.0', async () => {
    const { resolveTerminalAppearance } = await import('./resolve')
    expect(resolveTerminalAppearance(makeSettings({ terminalLineHeight: 0.5 })).lineHeight).toBe(1.0)
    expect(resolveTerminalAppearance(makeSettings({ terminalLineHeight: 3 })).lineHeight).toBe(2.0)
  })

  it('用例 10:cursorStyle bar / underline 原样映射,wavy 兜底 block', async () => {
    const { resolveTerminalAppearance } = await import('./resolve')
    expect(resolveTerminalAppearance(makeSettings({ terminalCursorStyle: 'bar' })).cursorStyle).toBe('bar')
    expect(
      resolveTerminalAppearance(makeSettings({ terminalCursorStyle: 'underline' })).cursorStyle
    ).toBe('underline')
    expect(
      resolveTerminalAppearance(makeSettings({ terminalCursorStyle: 'wavy' as Settings['terminalCursorStyle'] }))
        .cursorStyle
    ).toBe('block')
  })

  it('用例 11:theme 出参只由 terminalTheme 单槽决定,与 appTheme 无关', async () => {
    const { resolveTerminalAppearance } = await import('./resolve')
    const dark = resolveTerminalAppearance(makeSettings({ terminalTheme: 'Tango Dark' }))
    expect(dark.theme).toBe(TERMINAL_THEMES['Tango Dark'])
    const sameTerminal = resolveTerminalAppearance(
      makeSettings({ terminalTheme: 'Tango Dark', appTheme: 'vscode-light' })
    )
    expect(sameTerminal.theme).toBe(TERMINAL_THEMES['Tango Dark'])
  })
})
