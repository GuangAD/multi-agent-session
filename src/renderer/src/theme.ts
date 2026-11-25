// 主题落地(html 类唯一写手,T11 落 dark 类;T-R3 起改吃整份 AppTheme:按 isDark 写 .dark,
// 按 id 写主题类,color-scheme 同步)。
// Why 独立模块而不是塞进组件:深色样式全靠 Tailwind 的 dark: 变体(class 策略,见 main.css),
// 界面主题色全靠 .theme-<id> 变量覆盖(见 theme-tokens.css);「谁把 class 写上去」必须是一处;
// 组件只负责触发,不各自改 DOM。
import { APP_THEMES, type AppTheme } from '../../shared/themes/app-themes'

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

// 写入 <html>:dark 类(Tailwind dark: 变体按 .dark 命中)、主题类(.theme-<id>)与 color-scheme。
// 任意时机重复调用,全量重写:先清掉全部目录内主题类,再挂当前(目录外 id 不挂,兜底由 getAppTheme 负责)。
// Why 第三参注入:这是「谁写 html 类」的唯一写手,类切换的取舍最容易改错,必须能直测;测试环境无 DOM。
export function applyAppearance(
  theme: AppTheme,
  root: AppearanceRoot = document.documentElement as unknown as AppearanceRoot
): void {
  root.classList.toggle('dark', theme.isDark)
  // 逐个已知主题 id 移除,再按需挂当前主题:不枚举 classList(桩不必实现迭代,行为也更确定)
  for (const candidate of APP_THEMES) {
    root.classList.remove(`${THEME_CLASS_PREFIX}${candidate.id}`)
  }
  if (APP_THEMES.some((candidate) => candidate.id === theme.id)) {
    root.classList.add(`${THEME_CLASS_PREFIX}${theme.id}`)
  }
  root.style.colorScheme = theme.isDark ? 'dark' : 'light'
}
