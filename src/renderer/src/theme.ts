// 主题落地(纯函数 + DOM 写入,T11):settings.theme 三态 → <html class="dark"> 的解析与写入。
// Why 独立模块而不是塞进组件:深色样式全靠 Tailwind 的 dark: 变体(class 策略,见 main.css),
// 「谁把 class 写上去」必须是一处;组件只负责触发,不各自改 DOM。
import type { Settings } from '../../shared/types'

export type Theme = Settings['theme']

// 三态 → 实际是否深色;system 取系统当前值(调用方传入 matchMedia 结果,纯函数便于推理)
export function resolveDark(theme: Theme, systemDark: boolean): boolean {
  if (theme === 'dark') {
    return true
  }
  if (theme === 'light') {
    return false
  }
  return systemDark
}

// 写入 <html>:Tailwind dark: 变体按 .dark 命中;同时同步 color-scheme,
// 让浏览器原生控件(滚动条、表单控件、文本选区)跟着变深浅
export function applyDarkClass(dark: boolean): void {
  const root = document.documentElement
  root.classList.toggle('dark', dark)
  root.style.colorScheme = dark ? 'dark' : 'light'
}

// 系统当前是否深色(renderer 侧唯一来源;与主进程 nativeTheme 同源,都读操作系统设置)
export function systemPrefersDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}
