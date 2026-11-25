// 渲染层设置状态切片(T4,spec 模块划分):初载拉全量、patch 后以主进程返回的全量设置覆盖 store。
// Why 独立切片:设置对话框与 App 层外观应用不在同一组件树分支,经 store 共享;
// 主进程是设置的权威(settings:set 校验落盘后返回全量),渲染层不拼装局部状态。
import type { StateCreator } from 'zustand'
import { bridge } from '../ipc/bridge'
import { DEFAULT_APP_THEME_ID } from '../../../shared/themes/app-themes'
import { DEFAULT_TERMINAL_THEME_NAME } from '../../../shared/themes/resolve'
import type { Settings } from '../../../shared/types'
import { useAppStore, type AppState } from './app-store'

// 初载前的兜底值:主题两项直接取 shared 常量(与主进程 DEFAULT_STORE.settings 同源,不手抄),
// 仅在 loadSettings 完成前短暂可见(首帧由 main.tsx 按默认主题落类,不读这份数值)。
const INITIAL_SETTINGS: Settings = {
  scrollbackRows: 10000,
  appTheme: DEFAULT_APP_THEME_ID,
  terminalTheme: DEFAULT_TERMINAL_THEME_NAME,
  shell: 'powershell',
  terminalFontSize: 14,
  terminalFontWeight: 300,
  terminalLineHeight: 1.0,
  terminalCursorStyle: 'block',
  terminalCursorBlink: false
}

export interface SettingsSlice {
  settings: Settings
}

// Why function 声明而非 const 箭头(评审 Important-1):本切片与 app-store 互为值依赖——
// app-store 求值期当场执行 creator 解引用本函数,而 const 箭头不具名提升;当前不炸仅因
// App.tsx 的 import 顺序恰好 app-store 先行,任何模块先于 app-store 进入求值就是 TDZ
// ReferenceError 启动白屏,且 vitest 的 import 图恰好永远命中安全顺序,测试测不出来。
// function 声明在模块实例化期即初始化,双向求值顺序均安全(结构保证,不靠顺序偶然)。
export function createSettingsSlice(
  ...args: Parameters<StateCreator<AppState, [], [], SettingsSlice>>
): SettingsSlice {
  void args
  return { settings: INITIAL_SETTINGS }
}

// 读设置切片(订阅变更);selector 收到全量 Settings,与 useAppStore 同款用法
export function useSettings<T>(selector: (settings: Settings) => T): T {
  return useAppStore((state) => selector(state.settings))
}

// 启动/打开设置对话框时从主进程拉全量设置进 store;可重复调用,返回值与 store 一致。
// 失败不落 store、原样抛给调用方(App 层沿用「读取失败沿用默认值」既有策略)。
//
// Why 与 app-store 循环 import 安全:app-store 装配本切片,本模块只在函数运行期
// (useAppStore 已初始化后)才解引用,模块求值期不触碰。
export async function loadSettings(): Promise<Settings> {
  const settings = await bridge.settings.get()
  useAppStore.setState({ settings })
  return settings
}

// 发 patch 落盘,以主进程返回的全量设置更新 store;可 fire-and-forget(store 迟延一两帧),
// 并发调用以主进程返回顺序为准。出错:不回滚显示,console.error 记录,下次启动读回旧值
// (沿用 App 层既有策略),返回当前 store 值保持「返回值与 store 一致」。
export async function updateSettings(patch: Partial<Settings>): Promise<Settings> {
  try {
    const settings = await bridge.settings.set(patch)
    useAppStore.setState({ settings })
    return settings
  } catch (error) {
    console.error('保存设置失败,显示保持不变,下次启动读回旧值:', error)
    return useAppStore.getState().settings
  }
}
