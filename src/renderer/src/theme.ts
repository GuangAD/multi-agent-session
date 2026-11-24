// 主题落地(html 类唯一写手,T11 落 dark 类;T4 升级 applyAppearance:dark 类 + 界面主题类)。
// Why 独立模块而不是塞进组件:深色样式全靠 Tailwind 的 dark: 变体(class 策略,见 main.css),
// 界面主题色全靠 .theme-<id> 变量覆盖(见 theme-tokens.css);「谁把 class 写上去」必须是一处;
// 组件只负责触发,不各自改 DOM。
import type { Settings } from '../../shared/types'
import { APP_THEMES } from '../../shared/themes/app-themes'

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

// 界面主题类的类名前缀(与 theme-tokens.css 的 .theme-<id> 对应)
const THEME_CLASS_PREFIX = 'theme-'

// 外观写入目标:真实调用用 document.documentElement,测试传入最小桩(渲染层测试环境是 node,无 DOM)。
// 只要求 classList 的 toggle/add/remove 与 style.colorScheme,不绑定 HTMLElement 以便直测。
export interface AppearanceRoot {
  classList: {
    toggle: (token: string, force?: boolean) => boolean
    add: (token: string) => void
    remove: (token: string) => void
  }
  style: { colorScheme: string }
}

// 写入 <html>:dark 类(Tailwind dark: 变体按 .dark 命中)+ 主题类(.theme-<id>;default 与目录外 id
// 都不挂主题类,即 :root/.dark 默认观感)。任意时机重复调用,全量重写这两类;无失败路径。
// 同时同步 color-scheme,让浏览器原生控件(滚动条、表单控件、文本选区)跟着变深浅。
// Why 第三参注入:这是「谁写 html 类」的唯一写手,类切换的取舍(default 不挂、切换时清旧类、
// 目录外 id 兜底)最容易改错,必须能直测;测试环境无 DOM,故不硬绑 document。
export function applyAppearance(
  dark: boolean,
  appThemeId: string,
  root: AppearanceRoot = document.documentElement as unknown as AppearanceRoot
): void {
  root.classList.toggle('dark', dark)
  // 逐个已知主题 id 移除,再按需挂当前主题:不枚举 classList(桩不必实现迭代,行为也更确定)
  for (const theme of APP_THEMES) {
    root.classList.remove(`${THEME_CLASS_PREFIX}${theme.id}`)
  }
  if (appThemeId !== 'default' && APP_THEMES.some((theme) => theme.id === appThemeId)) {
    root.classList.add(`${THEME_CLASS_PREFIX}${appThemeId}`)
  }
  root.style.colorScheme = dark ? 'dark' : 'light'
}

// 系统当前是否深色(renderer 侧唯一来源;与主进程 nativeTheme 同源,都读操作系统设置)
export function systemPrefersDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}
