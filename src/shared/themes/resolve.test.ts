import { describe, expect, it } from 'vitest'
import type { Settings } from '../types'
import { DEFAULT_FONT_FALLBACK_CHAIN } from './fonts'
import { TERMINAL_THEMES } from './catalog'
import { APP_THEMES } from './app-themes'

// 设置工厂:非本接缝字段落 DEFAULT_STORE 同款默认值(spec 数据结构节),用例只覆写关注字段
const makeSettings = (overrides: Partial<Settings> = {}): Settings => ({
  scrollbackRows: 10000,
  theme: 'dark',
  shell: 'powershell',
  appThemeDark: 'default',
  appThemeLight: 'default',
  terminalThemeDark: 'Ghostty Default Style Dark',
  terminalThemeLight: 'Builtin Tango Light',
  terminalFontSize: 14,
  terminalFontWeight: 300,
  terminalLineHeight: 1.0,
  terminalCursorStyle: 'block',
  terminalCursorBlink: false,
  ...overrides
})

describe('selectTerminalTheme(主题选择解析:三态 + 系统深浅 + 双槽)', () => {
  it('用例 1:theme=dark 取深槽 Ghostty Default Style Dark,与系统深浅无关', async () => {
    const { selectTerminalTheme } = await import('./resolve')
    const result = selectTerminalTheme(makeSettings({ theme: 'dark' }), false)
    expect(result.mode).toBe('dark')
    expect(result.theme).toBe(TERMINAL_THEMES['Ghostty Default Style Dark'])
  })

  it('用例 2:theme=light 取浅槽 Builtin Tango Light,与系统深浅无关', async () => {
    const { selectTerminalTheme } = await import('./resolve')
    const result = selectTerminalTheme(makeSettings({ theme: 'light' }), true)
    expect(result.mode).toBe('light')
    expect(result.theme).toBe(TERMINAL_THEMES['Builtin Tango Light'])
  })

  it('用例 3:theme=system + 系统深 → 取深槽', async () => {
    const { selectTerminalTheme } = await import('./resolve')
    const result = selectTerminalTheme(makeSettings({ theme: 'system' }), true)
    expect(result.mode).toBe('dark')
    expect(result.theme).toBe(TERMINAL_THEMES['Ghostty Default Style Dark'])
  })

  it('用例 4:theme=system + 系统浅 → 取浅槽', async () => {
    const { selectTerminalTheme } = await import('./resolve')
    const result = selectTerminalTheme(makeSettings({ theme: 'system' }), false)
    expect(result.mode).toBe('light')
    expect(result.theme).toBe(TERMINAL_THEMES['Builtin Tango Light'])
  })

  it('用例 5:深槽 id 不在目录 → 落默认深主题 Ghostty Default Style Dark', async () => {
    const { selectTerminalTheme } = await import('./resolve')
    const result = selectTerminalTheme(makeSettings({ theme: 'dark', terminalThemeDark: 'No Such Theme' }), false)
    expect(result.mode).toBe('dark')
    expect(result.theme).toBe(TERMINAL_THEMES['Ghostty Default Style Dark'])
  })
})

describe('resolveTerminalAppearance(终端外观解析:字段独立映射 + 夹紧)', () => {
  it('用例 6:terminalFontFamily 缺省 → 输出完整默认回退链;scrollback 直通', async () => {
    const { resolveTerminalAppearance } = await import('./resolve')
    const out = resolveTerminalAppearance(makeSettings({ scrollbackRows: 20000 }), true)
    expect(out.fontFamily).toBe(DEFAULT_FONT_FALLBACK_CHAIN)
    expect(out.scrollback).toBe(20000)
  })

  it('用例 7:terminalFontFamily=JetBrains Mono → 链首插入 "JetBrains Mono",,其后原链逐字保留', async () => {
    const { resolveTerminalAppearance } = await import('./resolve')
    const out = resolveTerminalAppearance(makeSettings({ terminalFontFamily: 'JetBrains Mono' }), true)
    expect(out.fontFamily).toBe('"JetBrains Mono", ' + DEFAULT_FONT_FALLBACK_CHAIN)
  })

  it('用例 8:fontSize 3 / 99 → 夹紧 8 / 32', async () => {
    const { resolveTerminalAppearance } = await import('./resolve')
    expect(resolveTerminalAppearance(makeSettings({ terminalFontSize: 3 }), true).fontSize).toBe(8)
    expect(resolveTerminalAppearance(makeSettings({ terminalFontSize: 99 }), true).fontSize).toBe(32)
  })

  it('用例 9:lineHeight 0.5 / 3 → 夹紧 1.0 / 2.0', async () => {
    const { resolveTerminalAppearance } = await import('./resolve')
    expect(resolveTerminalAppearance(makeSettings({ terminalLineHeight: 0.5 }), true).lineHeight).toBe(1.0)
    expect(resolveTerminalAppearance(makeSettings({ terminalLineHeight: 3 }), true).lineHeight).toBe(2.0)
  })

  it('用例 10:cursorStyle bar / underline 原样映射,wavy 兜底 block', async () => {
    const { resolveTerminalAppearance } = await import('./resolve')
    expect(resolveTerminalAppearance(makeSettings({ terminalCursorStyle: 'bar' }), true).cursorStyle).toBe('bar')
    expect(resolveTerminalAppearance(makeSettings({ terminalCursorStyle: 'underline' }), true).cursorStyle).toBe('underline')
    // 坏枚举值经 IPC 落盘可能绕过类型,运行时按约定兜底 block
    expect(
      resolveTerminalAppearance(makeSettings({ terminalCursorStyle: 'wavy' as Settings['terminalCursorStyle'] }), true)
        .cursorStyle
    ).toBe('block')
  })
})

describe('selectAppTheme(界面主题选择解析:三态 + 系统深浅 + 双槽,与终端互不跟随)', () => {
  it('用例 1:theme=dark 取深槽 warm,与系统深浅无关', async () => {
    const { selectAppTheme } = await import('./resolve')
    const warm = APP_THEMES.find((theme) => theme.id === 'warm')!
    const result = selectAppTheme(makeSettings({ theme: 'dark', appThemeDark: 'warm' }), false)
    expect(result.mode).toBe('dark')
    expect(result.theme).toBe(warm)
  })

  it('用例 2:theme=light 取浅槽 warm,mode 指示同一套的 light 形态', async () => {
    const { selectAppTheme } = await import('./resolve')
    const warm = APP_THEMES.find((theme) => theme.id === 'warm')!
    const result = selectAppTheme(makeSettings({ theme: 'light', appThemeLight: 'warm' }), true)
    expect(result.mode).toBe('light')
    expect(result.theme).toBe(warm)
    expect(result.theme.light).toBe(warm.light)
  })

  it('用例 3:theme=system + 系统深 → 取深槽', async () => {
    const { selectAppTheme } = await import('./resolve')
    const warm = APP_THEMES.find((theme) => theme.id === 'warm')!
    const result = selectAppTheme(
      makeSettings({ theme: 'system', appThemeDark: 'warm', appThemeLight: 'cool' }),
      true
    )
    expect(result.mode).toBe('dark')
    expect(result.theme).toBe(warm)
  })

  it('用例 4:theme=system + 系统浅 → 取浅槽', async () => {
    const { selectAppTheme } = await import('./resolve')
    const cool = APP_THEMES.find((theme) => theme.id === 'cool')!
    const result = selectAppTheme(
      makeSettings({ theme: 'system', appThemeDark: 'warm', appThemeLight: 'cool' }),
      false
    )
    expect(result.mode).toBe('light')
    expect(result.theme).toBe(cool)
  })

  it('用例 5:槽 id nope 不在目录 → 落 default 套对应形态', async () => {
    const { selectAppTheme } = await import('./resolve')
    const fallback = APP_THEMES.find((theme) => theme.id === 'default')!
    const darkMiss = selectAppTheme(makeSettings({ theme: 'dark', appThemeDark: 'nope' }), false)
    expect(darkMiss.mode).toBe('dark')
    expect(darkMiss.theme).toBe(fallback)
    const lightMiss = selectAppTheme(makeSettings({ theme: 'light', appThemeLight: 'nope' }), true)
    expect(lightMiss.mode).toBe('light')
    expect(lightMiss.theme).toBe(fallback)
  })

  it('用例 6:终端槽任意改,selectAppTheme 结果不受 terminalTheme* 影响', async () => {
    const { selectAppTheme } = await import('./resolve')
    const warm = APP_THEMES.find((theme) => theme.id === 'warm')!
    const settings = makeSettings({
      theme: 'dark',
      appThemeDark: 'warm',
      appThemeLight: 'warm',
      terminalThemeDark: 'Builtin Tango Light',
      terminalThemeLight: 'Ghostty Default Style Dark'
    })
    const forcedDark = selectAppTheme(settings, false)
    expect(forcedDark.mode).toBe('dark')
    expect(forcedDark.theme).toBe(warm)
    const bySystem = selectAppTheme({ ...settings, theme: 'system' }, false)
    expect(bySystem.mode).toBe('light')
    expect(bySystem.theme).toBe(warm)
  })
})
