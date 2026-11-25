// 设置默认值的唯一来源(shared 叶子模块):渲染层初值与主进程 DEFAULT_STORE.settings 同源引用
// Why: 此前数值在渲染层 INITIAL_SETTINGS 与主进程 DEFAULT_STORE 两处手抄镜像,漂移无守卫;
// 且渲染层那份 const 位于与 app-store 循环值依赖的文件里,是 TDZ 启动白屏的结构残留面(theme 终审 P2-1)。
// 数值依据 spec 数据结构节 / shared/types.ts 注释;terminalFontFamily 可选缺省,故不列。
import { DEFAULT_APP_THEME_ID } from './themes/app-themes'
import { DEFAULT_TERMINAL_THEME_NAME } from './themes/resolve'
import type { Settings } from './types'

export const DEFAULT_SETTINGS: Settings = Object.freeze({
  scrollbackRows: 10000,
  appTheme: DEFAULT_APP_THEME_ID,
  terminalTheme: DEFAULT_TERMINAL_THEME_NAME,
  shell: 'powershell',
  terminalFontSize: 14,
  terminalFontWeight: 300,
  terminalLineHeight: 1.0,
  terminalCursorStyle: 'block',
  terminalCursorBlink: false
})
