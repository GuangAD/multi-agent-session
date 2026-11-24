// 主题切换按钮(T11 三态循环;T4 起三态与持久化改走 settings-slice,外观经 applyAppearance 唯一写手落地)。
// 挂在窗口标题栏(见 App.tsx):按钮自身 no-drag 才可点。
import { useCallback, useEffect } from 'react'
import { Monitor, Moon, Sun } from 'lucide-react'
import { Button } from './button'
import { applyAppearance, resolveDark, systemPrefersDark, type Theme } from '../../theme'
import { loadSettings, updateSettings, useSettings } from '../../store/settings-slice'
import { selectAppTheme } from '../../../../shared/themes/resolve'

// 循环顺序:系统 → 浅色 → 深色 → 系统
const NEXT_THEME: Record<Theme, Theme> = {
  system: 'light',
  light: 'dark',
  dark: 'system'
}

const LABEL: Record<Theme, string> = {
  system: '主题:跟随系统',
  light: '主题:浅色',
  dark: '主题:深色'
}

export function ThemeToggle(): React.JSX.Element {
  const theme = useSettings((settings) => settings.theme)
  const appThemeDark = useSettings((settings) => settings.appThemeDark)
  const appThemeLight = useSettings((settings) => settings.appThemeLight)

  // 深浅态 + 界面主题双槽 → applyAppearance 唯一写手落地;组件不直接碰 documentElement
  const applyFor = useCallback(
    (themeValue: Theme, systemDark: boolean): void => {
      applyAppearance(
        resolveDark(themeValue, systemDark),
        selectAppTheme({ theme: themeValue, appThemeDark, appThemeLight }, systemDark).theme.id
      )
    },
    [appThemeDark, appThemeLight]
  )

  // 启动初载:拉全量设置进 store 并按其落地;取不到(IPC 失败)按系统深浅 + 默认主题兜底
  useEffect(() => {
    let cancelled = false
    loadSettings()
      .then((settings) => {
        if (!cancelled) {
          applyAppearance(
            resolveDark(settings.theme, systemPrefersDark()),
            selectAppTheme(settings, systemPrefersDark()).theme.id
          )
        }
      })
      .catch((error) => {
        console.error('读取主题设置失败,按系统偏好显示:', error)
        if (!cancelled) {
          applyAppearance(systemPrefersDark(), 'default')
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  // 跟随系统时必须随系统变化实时切换(深/浅槽随系统深浅一起换);强制浅/深时忽略系统变化。
  // applyFor 随双槽 id 变化换身份,槽变更后监听器重建,不残留旧槽闭包。
  useEffect(() => {
    if (theme !== 'system') {
      return
    }
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (): void => applyFor(theme, media.matches)
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [theme, applyFor])

  const cycle = (): void => {
    const next = NEXT_THEME[theme]
    applyFor(next, systemPrefersDark())
    // 落盘失败不回滚显示:主题是即时的,下次启动读回旧值即可(updateSettings 内部 console.error,不抛)
    void updateSettings({ theme: next })
  }

  return (
    <Button
      variant="ghost"
      aria-label={LABEL[theme]}
      title={LABEL[theme]}
      className="!px-1.5 !py-1"
      onClick={cycle}
    >
      {theme === 'system' ? (
        <Monitor className="size-4" aria-hidden />
      ) : theme === 'light' ? (
        <Sun className="size-4" aria-hidden />
      ) : (
        <Moon className="size-4" aria-hidden />
      )}
    </Button>
  )
}
