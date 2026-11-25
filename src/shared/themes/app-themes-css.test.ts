// 色值一致性锚定测试(T-R2,spec 接缝六):APP_THEMES ↔ theme-tokens.css 的 .theme-<id> 块。
// Why 需要:主题色值由 gen-theme-data.py 同时写进 TS 目录与 CSS 变量块,生成器一旦漂移或有人手改
// 其中一份,目录测试只查 TS 自身格式,发现不了;本用例直接读 CSS 比对,把「同值」从注释搬成断言。
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

  it('用例 3:12 个 .theme-<id> 块各含 10 个 --app-* 变量,与目录同 id 逐值一致', () => {
    for (const theme of APP_THEMES) {
      const vars = readBlock(css, `.theme-${theme.id}`)
      expect(Object.keys(vars).length, `.theme-${theme.id} 应含全部 10 个变量`).toBe(10)
      for (const [token, cssVar] of Object.entries(TOKEN_VARS) as Array<[keyof AppTokenValues, string]>) {
        expect(vars[cssVar], `.theme-${theme.id} 的 ${cssVar} 与目录不一致`).toBe(
          theme.tokens[token].toLowerCase()
        )
      }
    }
  })

  it('用例 4:主题块数与目录套数相等,且无 .dark.theme-<id> 成对结构残留', () => {
    const blockCount = css.match(/^\.theme-[a-z-]+ \{/gm)?.length ?? 0
    expect(blockCount, 'CSS 主题块数应等于目录套数(12)').toBe(APP_THEMES.length)
    // 源序即优先级:.theme-<id> 与 .dark 同为单类选择器,主题块必须排在 .dark 之后才能覆盖兜底变量
    // (评审建议:此前只查块数,有人把主题块挪到 .dark 之前不会有测试转红)
    const firstThemeBlock = css.search(/^\.theme-[a-z-]+ \{/m)
    expect(firstThemeBlock, '主题块必须出现在 .dark 兜底块之后').toBeGreaterThan(css.indexOf('.dark {'))
    // 同理:color-scheme / 表单控件规则必须前置(文件头声明的不变量);把生成标记挪到它们之前会丢规则
    expect(firstThemeBlock, '主题块必须排在 color-scheme 规则之后').toBeGreaterThan(
      css.indexOf('color-scheme: light')
    )
    expect(css.includes('.dark.theme-'), '单色板后不应再有深浅成对的选择器').toBe(false)
    // :root / .dark 兜底仍在(设置加载前的首帧观感)
    expect(Object.keys(readBlock(css, ':root')).length).toBeGreaterThanOrEqual(10)
    expect(Object.keys(readBlock(css, '.dark')).length).toBeGreaterThanOrEqual(10)
  })
})
