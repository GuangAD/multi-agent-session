// 接缝 applyAppearance 模块行为测试(接口面清单:theme.ts 唯一写手)。
// 期望值来源:spec 数据结构节 token 落地约定(主题类 .theme-<id>;default 不挂类)
// + brief 第 7.1 验收 2/9(三态换槽、标题栏按钮行为不变的前提是写类逻辑正确)。
// 测试环境是 node(vitest.config environment: 'node'),故传入最小桩而非真实 document。
import { describe, expect, it } from 'vitest'
import { applyAppearance, resolveDark, type AppearanceRoot } from './theme'
import { APP_THEMES } from '../../shared/themes/app-themes'

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

describe('applyAppearance(唯一写手)', () => {
  it('深色 + 非默认主题:挂 dark 与 theme-<id>,colorScheme 同步 dark', () => {
    const { root, classes } = makeRoot()
    applyAppearance(true, 'warm', root)

    expect(classes.has('dark')).toBe(true)
    expect(classes.has('theme-warm')).toBe(true)
    expect(root.style.colorScheme).toBe('dark')
  })

  it('default 主题不挂主题类(即 :root/.dark 默认观感)', () => {
    const { root, classes } = makeRoot()
    applyAppearance(false, 'default', root)

    expect(classes.has('dark')).toBe(false)
    expect([...classes].some((name) => name.startsWith('theme-'))).toBe(false)
    expect(root.style.colorScheme).toBe('light')
  })

  it('切换主题时清掉旧主题类,只留当前一个(重复调用幂等)', () => {
    const { root, classes } = makeRoot()
    applyAppearance(true, 'warm', root)
    applyAppearance(true, 'forest', root)
    applyAppearance(true, 'forest', root)

    const themeClasses = [...classes].filter((name) => name.startsWith('theme-'))
    expect(themeClasses).toEqual(['theme-forest'])
  })

  it('目录外 id 兜底为不挂主题类(与「坏 id 落默认」口径一致)', () => {
    const { root, classes } = makeRoot(['theme-warm'])
    applyAppearance(true, 'no-such-theme', root)

    expect([...classes].some((name) => name.startsWith('theme-'))).toBe(false)
    expect(classes.has('dark')).toBe(true)
  })

  it('目录内每个 id 都能挂上对应主题类(与 APP_THEMES 对齐)', () => {
    for (const theme of APP_THEMES) {
      const { root, classes } = makeRoot()
      applyAppearance(false, theme.id, root)
      if (theme.id === 'default') {
        expect([...classes].some((name) => name.startsWith('theme-'))).toBe(false)
      } else {
        expect(classes.has(`theme-${theme.id}`)).toBe(true)
      }
    }
  })

  it('三态解析与写类衔接:system 取系统深浅,light/dark 强制(验收条目 2/9)', () => {
    expect(resolveDark('system', true)).toBe(true)
    expect(resolveDark('system', false)).toBe(false)
    expect(resolveDark('light', true)).toBe(false)
    expect(resolveDark('dark', false)).toBe(true)
  })
})
