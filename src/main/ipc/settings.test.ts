// applyPatch 模块行为测试(契约「测试规格」用例 5–6):不经 IPC,直接调用导出的函数。
// 期望值来源:brief 第 5 节默认值边界(字号 14 [8,32]、行高 1.0 [1.0,2.0]、字重三档 300/400/500、
// 光标三枚举)与 spec 数据结构节默认值;坏值一律忽略或夹紧,不抛出。
// electron / app-window 只是 settings.ts 的 IPC 注册期依赖,Node 测试环境加载不到真实 electron,
// 用最小桩让模块可加载;断言不触达这些桩。
import * as electronNs from 'electron'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DEFAULT_STORE } from '../session-store/store-persistence'
import { beforeAll, expect, it, vi } from 'vitest'
import type { Settings } from '../../shared/types'

// 触发 electron mock 的原生拦截激活(仅命名空间引用,不产生具名导入互操作校验)
void electronNs

// settings.ts 的 IPC 注册期依赖 app-window 会连带到 electron 资源导入(icon.png?asset,Vite 专属,
// settings.ts 的 IPC 注册期依赖 app-window 会连带到 electron 资源导入(icon.png?asset,Vite 专属,
// Node 测试环境加载不到),mock 掉整模块即可斩断;色值计算用可断言的桩记录调用参数
// (真实色值映射在 app-window,node 环境加载不到,由门 3 冒烟承担)。
const { overlayColorsMock } = vi.hoisted(() => ({
  overlayColorsMock: vi.fn(() => ({ color: '#000000', symbolColor: '#ffffff' }))
}))
vi.mock('../app-window', () => ({
  TITLE_BAR_OVERLAY_HEIGHT: 40,
  titleBarOverlayColorsForSettings: overlayColorsMock
}))

vi.mock('electron', () => {
  const stub = {
    ipcMain: { handle: vi.fn() },
    nativeTheme: { shouldUseDarkColors: true, themeSource: 'system', on: vi.fn() },
    BrowserWindow: class {},
    shell: { openExternal: vi.fn() },
    app: { isPackaged: false },
    session: {}
  }
  // electron 是 CJS 外部模块:mock 需同时给 default(互操作合并源)与命名导出,
  // 否则具名导入在 vite 互操作校验处报 "Named export not found"
  return { ...stub, default: stub }
})

// Why 动态导入 settings 模块:settings → app-window → electron 是外部化 CJS 依赖链,
// 静态传递导入会先于 vi.mock 注册触发真实 electron 的具名导入互操作错误;
// beforeAll 里导入时 vi.mock 已注册完毕,模块加载走 electron 桩。
// 红阶段 applyPatch 未导出时解构得 undefined,每条用例独立失败(非文件级崩溃)。
let applyPatch: (typeof import('./settings'))['applyPatch']
let registerSettingsIpc: (typeof import('./settings'))['registerSettingsIpc']
beforeAll(async () => {
  ;({ applyPatch, registerSettingsIpc } = await import('./settings'))
})

// 每例独立初始设置(DEFAULT_STORE 深拷贝),applyPatch 约定原地修改
function freshSettings(): Settings {
  return structuredClone(DEFAULT_STORE.settings)
}

it('applyPatch 用例 5:fontSize 越界 3/99 夹紧 8/32,非数字与缺省不动', () => {
  const clampedLow = freshSettings()
  applyPatch(clampedLow, { terminalFontSize: 3 })
  expect(clampedLow.terminalFontSize).toBe(8)

  const clampedHigh = freshSettings()
  applyPatch(clampedHigh, { terminalFontSize: 99 })
  expect(clampedHigh.terminalFontSize).toBe(32)

  const notNumber = freshSettings()
  applyPatch(notNumber, { terminalFontSize: 'x' as unknown as number })
  expect(notNumber.terminalFontSize).toBe(14) // 非数字忽略,保持默认

  const untouched = freshSettings()
  applyPatch(untouched, {})
  expect(untouched.terminalFontSize).toBe(14) // patch 缺省该字段 → 不动
})

it('applyPatch 用例 5:lineHeight 越界 0.5/3 夹紧 1.0/2.0', () => {
  const low = freshSettings()
  applyPatch(low, { terminalLineHeight: 0.5 })
  expect(low.terminalLineHeight).toBe(1.0)

  const high = freshSettings()
  applyPatch(high, { terminalLineHeight: 3 })
  expect(high.terminalLineHeight).toBe(2.0)
})

it('applyPatch 用例 5:fontWeight 350 不在三档(300/400/500),忽略不写', () => {
  const settings = freshSettings()
  applyPatch(settings, { terminalFontWeight: 350 })
  expect(settings.terminalFontWeight).toBe(300) // 保持默认,不做就近夹紧
})

it("applyPatch 用例 5:cursorStyle 'wavy' 非三枚举,忽略不写", () => {
  const settings = freshSettings()
  applyPatch(settings, {
    terminalCursorStyle: 'wavy'
  } as unknown as Partial<Settings>)
  expect(settings.terminalCursorStyle).toBe('block') // 保持默认
})

it('T-R1 用例 7:appTheme / terminalTheme 收到数字或空串,忽略不写', () => {
  const settings = freshSettings()
  applyPatch(settings, {
    appTheme: 123,
    terminalTheme: 123
  } as unknown as Partial<Settings>)
  expect(settings.appTheme).toBe('github-dark')
  expect(settings.terminalTheme).toBe('Ghostty Default Style Dark')

  const blank = freshSettings()
  applyPatch(blank, { appTheme: '', terminalTheme: '' })
  expect(blank.appTheme).toBe('github-dark') // 空串 = 未设置,不覆盖默认
  expect(blank.terminalTheme).toBe('Ghostty Default Style Dark')
})

it('T-R1 用例 8:合法 patch 新字段一次全写入,原地修改内存 settings', () => {
  const settings = freshSettings()
  const patch: Partial<Settings> = {
    appTheme: 'carbonfox',
    terminalTheme: 'Tango Dark',
    terminalFontFamily: 'JetBrains Mono',
    terminalFontSize: 12,
    terminalFontWeight: 400,
    terminalLineHeight: 1.5,
    terminalCursorStyle: 'bar',
    terminalCursorBlink: true
  }
  applyPatch(settings, patch)
  // 同一内存对象上全字段写入:patch 值覆盖默认,其余字段不动
  expect(settings).toEqual({ ...DEFAULT_STORE.settings, ...patch })
})

it('T-R1 用例 9:patch 带第一版旧字段(三态 / 双槽),一律忽略且不写进内存 settings', () => {
  const settings = freshSettings()
  applyPatch(settings, {
    theme: 'dark',
    appThemeDark: 'warm',
    appThemeLight: 'cool',
    terminalThemeDark: 'Tango Light',
    terminalThemeLight: 'Builtin Tango Light'
  } as unknown as Partial<Settings>)
  expect(settings).toEqual(DEFAULT_STORE.settings)
  expect(settings).not.toHaveProperty('theme')
})

// T2 补充守卫(reviewer Minor 转办):fontFamily「含空串写入」这条细则将来若被误改成拒绝空串,
// 终端字体的「清空=回退默认链」交互就坏了;此用例钉住它(mutation check 见 plan.md T2 块)
it('T2 守卫:fontFamily 空串合法写入(空 = 默认回退链语义),非字符串忽略', () => {
  const empty = freshSettings()
  applyPatch(empty, { terminalFontFamily: '' })
  expect(empty.terminalFontFamily).toBe('')

  const notString = freshSettings()
  applyPatch(notString, { terminalFontFamily: 123 as unknown as string })
  expect(notString.terminalFontFamily).toBeUndefined()
})

// ============ 主进程原生控件着色(T-R6,ADR-0009:isDark 只用于 color-scheme 与原生控件)============
// 期望值来源:ADR-0009 与 brief 第 5 节。真实色值映射在 app-window 的 titleBarOverlayColorsForSettings
// (node 环境加载不到 icon.png?asset),故此处验「由界面主题算出明暗」与「overlay 重算收到新设置」,
// 色值到顶栏的实际一致性由门 3 冒烟承担。

// 取最近一次注册的 settings:set handler(registerSettingsIpc 先注册 get 再注册 set)
function takeSettingsSetHandler(): (event: unknown, patch: Partial<Settings>) => Promise<Settings> {
  const handler = vi.mocked(electronNs.ipcMain.handle).mock.calls.at(-1)?.[1]
  if (!handler) {
    throw new Error('settings:set handler 未注册')
  }
  return handler as (event: unknown, patch: Partial<Settings>) => Promise<Settings>
}

// 注册 IPC 并返回可断言的假窗口(平台判断在 Windows 上走 overlay 分支)
async function withRegisteredIpc(
  run: (setHandler: (event: unknown, patch: Partial<Settings>) => Promise<Settings>, setOverlay: ReturnType<typeof vi.fn>) => Promise<void>
): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), 'agent-sessions-settings-'))
  try {
    const store = structuredClone(DEFAULT_STORE)
    const setOverlay = vi.fn()
    const window = { isDestroyed: () => false, setTitleBarOverlay: setOverlay }
    vi.mocked(electronNs.ipcMain.handle).mockClear()
    overlayColorsMock.mockClear()
    registerSettingsIpc(store, () => window as never, join(dir, 'store.json'))
    await run(takeSettingsSetHandler(), setOverlay)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

it('T-R6 用例 1:appTheme 改为浅色主题 → themeSource=light,overlay 按新设置重算', async () => {
  await withRegisteredIpc(async (setHandler, setOverlay) => {
    setOverlay.mockClear()
    await setHandler({}, { appTheme: 'vscode-light' })
    expect(electronNs.nativeTheme.themeSource, '浅色主题应声明 light').toBe('light')
    expect(overlayColorsMock).toHaveBeenCalledWith(expect.objectContaining({ appTheme: 'vscode-light' }))
    expect(setOverlay).toHaveBeenCalledWith(expect.objectContaining({ height: 40 }))
  })
})

it('T-R6 用例 2:appTheme 为目录外坏 id → 按默认主题 github-dark 算,themeSource=dark', async () => {
  await withRegisteredIpc(async (setHandler) => {
    await setHandler({}, { appTheme: 'nope' })
    expect(electronNs.nativeTheme.themeSource, '坏 id 应兜底为默认深色主题').toBe('dark')
    expect(overlayColorsMock).toHaveBeenCalledWith(expect.objectContaining({ appTheme: 'nope' }))
  })
})
