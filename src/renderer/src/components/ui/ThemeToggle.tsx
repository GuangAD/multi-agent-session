// 主题切换按钮(T11,spec:components/ui/ThemeToggle):三态循环 系统 → 浅色 → 深色。
// 挂在窗口标题栏(见 App.tsx):按钮自身 no-drag 才可点。
// 状态只在这里持有:主题是纯外观设置,无其他组件需要读它(Tailwind 的 dark: 变体已经全局生效)。
import { useEffect, useState } from 'react'
import { Monitor, Moon, Sun } from 'lucide-react'
import { bridge } from '../../ipc/bridge'
import { Button } from './button'
import { applyDarkClass, resolveDark, systemPrefersDark, type Theme } from '../../theme'

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
  const [theme, setTheme] = useState<Theme>('system')

  // 启动:取持久化主题并落地;取不到(IPC 失败)按系统默认深色判断兜底
  useEffect(() => {
    let cancelled = false
    bridge.settings
      .get()
      .then((settings) => {
        if (!cancelled) {
          setTheme(settings.theme)
          applyDarkClass(resolveDark(settings.theme, systemPrefersDark()))
        }
      })
      .catch((error) => {
        console.error('读取主题设置失败,按系统偏好显示:', error)
        applyDarkClass(systemPrefersDark())
      })
    return () => {
      cancelled = true
    }
  }, [])

  // 跟随系统时必须随系统变化实时切换;强制浅/深时忽略系统变化
  useEffect(() => {
    if (theme !== 'system') {
      return
    }
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (): void => applyDarkClass(media.matches)
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [theme])

  const cycle = (): void => {
    const next = NEXT_THEME[theme]
    setTheme(next)
    applyDarkClass(resolveDark(next, systemPrefersDark()))
    // 落盘失败不回滚显示:主题是即时的,下次启动读回旧值即可(不为此加复杂回滚)
    void bridge.settings.set({ theme: next }).catch((error) => {
      console.error('保存主题设置失败:', error)
    })
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
