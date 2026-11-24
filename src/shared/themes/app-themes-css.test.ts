// 色值一致性锚定测试(spec 数据结构节 token 落地的两处照抄:APP_THEMES ↔ theme-tokens.css)。
// Why 需要:主题色值写在 TS 目录里,再手抄成 CSS 的 .theme-<id> 变量块;两边谁被单改都不会被
// 别的用例发现(目录测试只查 TS 自身格式)。本用例直接读 CSS 文件比对,把「同值」从注释搬成断言。
// 测试环境是 node,可用 fs;路径相对仓库根(process.cwd() 在 vitest 下是项目根)。
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { APP_THEMES, type AppTokenValues } from './app-themes'

const CSS_PATH = 'src/renderer/src/assets/theme-tokens.css'

// token 名 → CSS 变量名(与 theme-tokens.css 的变量表对齐)
const TOKEN_VARS: Record<keyof AppTokenValues, string> = {
  base: '--app-base',
  panel: '--app-panel',
  surface: '--app-surface',
  line: '--app-line',
  ink: '--app-ink',
  inkMuted: '--app-ink-muted',
  accent: '--app-accent',
  onAccent: '--app-on-accent',
  hover: '--app-hover',
  accentHover: '--app-accent-hover'
}

// 取某个选择器块内的变量表:块从 `selector {` 起,到下一个 `}` 止(本文件块内无嵌套)
function readBlock(css: string, selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`)
  if (start < 0) {
    return {}
  }
  const bodyStart = css.indexOf('{', start) + 1
  const bodyEnd = css.indexOf('}', bodyStart)
  const body = css.slice(bodyStart, bodyEnd)
  const values: Record<string, string> = {}
  for (const match of body.matchAll(/(--app-[a-z-]+):\s*(#[0-9a-fA-F]{6})/g)) {
    values[match[1]] = match[2].toLowerCase()
  }
  return values
}

describe('界面主题色值:APP_THEMES 与 theme-tokens.css 必须逐值一致', () => {
  const css = readFileSync(CSS_PATH, 'utf8')

  it('default 套两形态 = :root / .dark 基准值', () => {
    const defaultTheme = APP_THEMES.find((theme) => theme.id === 'default')!
    const lightVars = readBlock(css, ':root')
    const darkVars = readBlock(css, '.dark')
    expect(Object.keys(lightVars).length, ':root 应含全部 10 个 --app-* 变量').toBe(10)
    expect(Object.keys(darkVars).length, '.dark 应覆盖全部 10 个 --app-* 变量').toBe(10)

    for (const [token, cssVar] of Object.entries(TOKEN_VARS) as Array<[keyof AppTokenValues, string]>) {
      expect(lightVars[cssVar], `:root 的 ${cssVar} 应与 default 浅形态一致`).toBe(
        defaultTheme.light[token].toLowerCase()
      )
      expect(darkVars[cssVar], `.dark 的 ${cssVar} 应与 default 深形态一致`).toBe(
        defaultTheme.dark[token].toLowerCase()
      )
    }
  })

  it('其余每套主题的浅/深两块与目录逐值一致', () => {
    for (const theme of APP_THEMES) {
      if (theme.id === 'default') {
        continue // default 不挂主题类,值就是 :root/.dark,上一条已覆盖
      }
      const lightVars = readBlock(css, `.theme-${theme.id}`)
      const darkVars = readBlock(css, `.dark.theme-${theme.id}`)
      expect(Object.keys(lightVars).length, `.theme-${theme.id} 应含全部 10 个变量`).toBe(10)
      expect(Object.keys(darkVars).length, `.dark.theme-${theme.id} 应含全部 10 个变量`).toBe(10)

      for (const [token, cssVar] of Object.entries(TOKEN_VARS) as Array<[keyof AppTokenValues, string]>) {
        expect(lightVars[cssVar], `${theme.id} 浅形态 ${cssVar} 与目录不一致`).toBe(
          theme.light[token].toLowerCase()
        )
        expect(darkVars[cssVar], `${theme.id} 深形态 ${cssVar} 与目录不一致`).toBe(
          theme.dark[token].toLowerCase()
        )
      }
    }
  })
})
