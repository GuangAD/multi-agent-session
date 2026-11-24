// settings-slice 测试(T4):初载拉全量、patch 以主进程返回值同步 store、失败不回滚。
// 期望值来源:T4 契约接口面(loadSettings/updateSettings 的用途与出错约定);
// bridge 打桩,不起真实 IPC(与 agents-slice.test.ts 同款)。useSettings 是 hook 薄委托,由冒烟覆盖。
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { bridge } from '../ipc/bridge'
import type { Settings } from '../../../shared/types'
import { useAppStore } from './app-store'
import { loadSettings, updateSettings } from './settings-slice'

vi.mock('../ipc/bridge', () => ({
  bridge: {
    settings: { get: vi.fn(), set: vi.fn() }
  }
}))

const getMock = vi.mocked(bridge.settings.get)
const setMock = vi.mocked(bridge.settings.set)

// 字面量与切片初值同源(DEFAULT_STORE.settings 同值);用例只覆写关注字段
const BASELINE: Settings = {
  scrollbackRows: 10000,
  theme: 'system',
  shell: 'powershell',
  appThemeDark: 'default',
  appThemeLight: 'default',
  terminalThemeDark: 'Ghostty Default Style Dark',
  terminalThemeLight: 'Builtin Tango Light',
  terminalFontSize: 14,
  terminalFontWeight: 300,
  terminalLineHeight: 1.0,
  terminalCursorStyle: 'block',
  terminalCursorBlink: false
}
const LOADED: Settings = { ...BASELINE, theme: 'dark', appThemeDark: 'warm' }

beforeEach(() => {
  getMock.mockReset()
  setMock.mockReset()
  useAppStore.setState({ settings: BASELINE })
})

describe('settings-slice(初载与 patch 同步)', () => {
  it('用例 1:loadSettings 拉全量设置进 store,返回值与 store 一致,可重复调用', async () => {
    getMock.mockResolvedValue(LOADED)
    const first = await loadSettings()
    expect(useAppStore.getState().settings).toEqual(LOADED)
    expect(first).toEqual(LOADED)
    const second = await loadSettings()
    expect(second).toEqual(LOADED)
    expect(getMock).toHaveBeenCalledTimes(2)
  })

  it('用例 2:updateSettings 发 patch,以主进程返回的全量设置更新 store', async () => {
    const saved: Settings = { ...BASELINE, theme: 'light' }
    setMock.mockResolvedValue(saved)
    const result = await updateSettings({ theme: 'light' })
    expect(setMock).toHaveBeenCalledWith({ theme: 'light' })
    expect(useAppStore.getState().settings).toEqual(saved)
    expect(result).toEqual(saved)
  })

  it('用例 3:updateSettings 失败:store 不回滚、不抛错(fire-and-forget 安全)、console.error 记录', async () => {
    setMock.mockRejectedValue(new Error('set failed'))
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = await updateSettings({ theme: 'dark' })
    expect(useAppStore.getState().settings, '失败必须保持旧值').toEqual(BASELINE)
    expect(result).toEqual(BASELINE)
    expect(errorSpy).toHaveBeenCalled()
    errorSpy.mockRestore()
  })

  it('用例 4:loadSettings 失败:原样抛出(调用方按既有策略兜底),store 不被污染', async () => {
    getMock.mockRejectedValue(new Error('get failed'))
    await expect(loadSettings()).rejects.toThrow('get failed')
    expect(useAppStore.getState().settings).toEqual(BASELINE)
  })
})
