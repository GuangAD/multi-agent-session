// 接缝 applyAppearance 模块行为测试(接口面清单:theme.ts 唯一写手)。
// 期望值来源:brief 第 5 节(isDark 只承担 color-scheme 与原生控件)与 spec 数据结构节
// (每套主题一个 .theme-<id> 块,写手按 isDark 决定 .dark)。
// 测试环境是 node(vitest.config environment: 'node'),故传入最小桩而非真实 document。
import { describe, expect, it } from 'vitest'
import { applyAppearance, type AppearanceRoot } from './theme'
import { APP_THEMES, type AppTheme, type AppThemeId } from '../../shared/themes/app-themes'

// 类名集合桩:只实现写手实际用到的三个方法
function makeRoot(initial: string[] = []): { root: AppearanceRoot; classes: Set<string> } {
  const classes = new Set(initial)
  const root: AppearanceRoot = {
    classList: {
      toggle: (token, force) => {
        const shouldAdd = force ?? !classes.has(token)
        if (shouldAdd) {
          classes.add(token)
        } else {
          classes.delete(token)
        }
        return shouldAdd
      },
      add: (token) => {
        classes.add(token)
      },
      remove: (token) => {
        classes.delete(token)
      }
    },
    style: { colorScheme: '' }
  }
  return { root, classes }
}

function themeById(id: AppThemeId): AppTheme {
  return APP_THEMES.find((theme) => theme.id === id)!
}

describe('applyAppearance(唯一写手)', () => {
  it('用例 1:深色主题 github-dark → 挂 dark 与 theme-github-dark,colorScheme 同步 dark', () => {
    const { root, classes } = makeRoot()
    applyAppearance(themeById('github-dark'), root)

    expect(classes.has('dark')).toBe(true)
    expect(classes.has('theme-github-dark')).toBe(true)
    expect(root.style.colorScheme).toBe('dark')
  })

  it('用例 2:浅色主题 vscode-light → 不挂 dark,挂 theme-vscode-light,colorScheme 同步 light', () => {
    const { root, classes } = makeRoot(['dark'])
    applyAppearance(themeById('vscode-light'), root)

    expect(classes.has('dark')).toBe(false)
    expect(classes.has('theme-vscode-light')).toBe(true)
    expect(root.style.colorScheme).toBe('light')
  })

  it('用例 3:切换主题时清掉旧主题类,只留当前一个(重复调用幂等)', () => {
    const { root, classes } = makeRoot()
    applyAppearance(themeById('carbonfox'), root)
    applyAppearance(themeById('tomorrow'), root)
    applyAppearance(themeById('tomorrow'), root)

    const themeClasses = [...classes].filter((name) => name.startsWith('theme-'))
    expect(themeClasses).toEqual(['theme-tomorrow'])
  })

  it('用例 4:目录内 12 个 id 都能挂上对应主题类(与 APP_THEMES 对齐)', () => {
    expect(APP_THEMES).toHaveLength(12)
    for (const theme of APP_THEMES) {
      const { root, classes } = makeRoot()
      applyAppearance(theme, root)
      expect(classes.has(`theme-${theme.id}`), `${theme.id} 应挂上 theme-${theme.id}`).toBe(true)
      expect(classes.has('dark'), `${theme.id} 的 .dark 应与 isDark 一致`).toBe(theme.isDark)
    }
  })

  it('用例 5:目录外 id 传入不挂任何主题类(兜底由 getAppTheme 负责,写手不做二次兜底)', () => {
    const { root, classes } = makeRoot(['theme-github-light'])
    const bogus = { ...themeById('github-dark'), id: 'no-such-theme' as AppThemeId }
    applyAppearance(bogus, root)

    expect([...classes].some((name) => name.startsWith('theme-'))).toBe(false)
    expect(classes.has('dark')).toBe(true)
  })

  it('用例 6:isDark 与 color-scheme 衔接——深色套写 dark、浅色套写 light(验收条目 7)', () => {
    for (const theme of APP_THEMES) {
      const { root } = makeRoot()
      applyAppearance(theme, root)
      expect(root.style.colorScheme, `${theme.id} 的 color-scheme`).toBe(theme.isDark ? 'dark' : 'light')
    }
  })
})
