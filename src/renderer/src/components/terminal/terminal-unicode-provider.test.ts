// terminal-unicode-provider 行为专测:宽度规则的期望值全部来自真实 xterm 6.1.0-beta.336 +
// pi bundle 探针(headless 写入后读 buffer.cursorX),不是按实现推导。用例为 mutation 钉住:
// 删掉 VS16 规则 / ZWJ 规则应对应转红。
import { describe, expect, it } from 'vitest'
import type { IUnicodeHandling, IUnicodeVersionProvider } from '@xterm/xterm'
import { activateRgiUnicodeProvider } from './terminal-unicode-provider'

// 属性打包与 xterm UnicodeService 同构(位定义见 terminal-unicode-provider.ts)
const createProps = (kind: number, width: 0 | 1 | 2, shouldJoin: boolean): number =>
  ((kind & 0xffffff) << 3) | ((width & 3) << 1) | (shouldJoin ? 1 : 0)
const extractWidth = (properties: number): 0 | 1 | 2 => ((properties >> 1) & 3) as 0 | 1 | 2
const extractKind = (properties: number): number => properties >> 3
const extractJoin = (properties: number): boolean => (properties & 1) === 1

const ZWJ = 0x200d
const VS16 = 0xfe0f

// 基表桩:复刻 UnicodeV11.charProperties 的关键语义——wcwidth 查表,零宽字符 join 进前格
// 并继承其宽度(xterm 源码 node_modules/@xterm/addon-unicode11/src/UnicodeV11.ts)
const makeBaseProvider = (): IUnicodeVersionProvider => {
  const wcwidth = (codepoint: number): 0 | 1 | 2 => {
    if (codepoint === ZWJ || codepoint === VS16) return 0
    if (codepoint === 0x2705 || codepoint === 0x4e2d || codepoint === 0x1f534) return 2
    return 1
  }
  return {
    version: '11',
    wcwidth,
    charProperties: (codepoint, preceding) => {
      let width = wcwidth(codepoint)
      let shouldJoin = width === 0 && preceding !== 0
      if (shouldJoin) {
        const oldWidth = extractWidth(preceding)
        if (oldWidth === 0) {
          shouldJoin = false
        } else if (oldWidth > width) {
          width = oldWidth
        }
      }
      return createProps(0, width, shouldJoin)
    }
  }
}

// xterm Terminal 桩:unicode.register 捕获 provider,供行为断言直接调用
const makeTerminalStub = (baseProvider: IUnicodeVersionProvider | undefined) => {
  const registered: IUnicodeVersionProvider[] = []
  const unicode: IUnicodeHandling = {
    activeVersion: '11',
    versions: baseProvider ? ['11'] : [],
    register: (provider) => {
      registered.push(provider)
      ;(unicode.versions as string[]).push(provider.version)
    }
  }
  const providers: Record<string, IUnicodeVersionProvider> = baseProvider
    ? { '11': baseProvider }
    : {}
  const terminal = {
    unicode,
    _core: { unicodeService: { _providers: providers } }
  }
  return { terminal, registered }
}

// 经 activate 拿到已注册的 provider(走公开入口,不在源码额外导出类)
const activatedProvider = (): IUnicodeVersionProvider => {
  const { terminal, registered } = makeTerminalStub(makeBaseProvider())
  activateRgiUnicodeProvider(terminal)
  expect(registered.length).toBe(1)
  return registered[0]!
}

describe('terminal-unicode-provider 宽度规则', () => {
  it('VS16:窄基码后自占 1 格不 join,序列共 2 格,对齐 pi 的 RGI 口径', () => {
    // 真实 xterm 探针:'ab➡️c' 在 '11' 基表下 cursorX=4(序列 1 格),pi 排版要 5(序列 2 格)
    const provider = activatedProvider()
    const arrowProps = createProps(0x27a1, 1, false) // 裸 ➡ 走基表:narrow、不 join

    const props = provider.charProperties(VS16, arrowProps)
    expect(extractWidth(props), 'VS16 应自占 1 格(序列共 2 格)').toBe(1)
    expect(extractJoin(props), 'VS16 不得 join 进前格,否则序列仍只消费 1 格').toBe(false)
  })

  it('VS16:宽格 emoji(如 ✅️)不二次加宽,仍走基表 join 共 2 格', () => {
    // 真实 xterm 探针:'a🔴️b' cursorX=4(2+1);precedingWidth===1 的门槛保证不误伤宽格
    const provider = activatedProvider()
    const wideProps = createProps(0x2705, 2, false)

    const props = provider.charProperties(VS16, wideProps)
    expect(extractWidth(props)).toBe(2)
    expect(extractJoin(props)).toBe(true)
  })

  it('ZWJ:组合 emoji(👨‍👩‍👧)各成员 join 进首格,整序列只消费 2 格', () => {
    // Orca 原版规则;真实 xterm 探针:'a🧑‍🚀b' cursorX=4(2+1),基表下是 6(每个 emoji 各占)
    const provider = activatedProvider()
    const womanProps = createProps(0x1f469, 2, false)

    const zwjProps = provider.charProperties(ZWJ, womanProps)
    expect(extractKind(zwjProps), 'ZWJ 应带专属 kind,供下一成员识别').toBe(ZWJ)
    expect(extractWidth(zwjProps)).toBe(2)
    expect(extractJoin(zwjProps)).toBe(true)

    const nextProps = provider.charProperties(0x1f469, zwjProps)
    expect(extractWidth(nextProps), 'ZWJ 后成员继承首格宽度,不另占格').toBe(2)
    expect(extractJoin(nextProps)).toBe(true)
  })

  it('无关字符透传基表:wcwidth 与 charProperties 均不偏离', () => {
    const base = makeBaseProvider()
    const provider = activatedProvider()

    expect(provider.wcwidth(0x4e2d)).toBe(base.wcwidth(0x4e2d))
    expect(provider.charProperties(0x4e2d, 0)).toBe(base.charProperties(0x4e2d, 0))
  })

  describe('activateRgiUnicodeProvider 激活路径', () => {
    it("有 '11' 基表:注册并激活 '11-rgi',重复激活幂等", () => {
      const { terminal, registered } = makeTerminalStub(makeBaseProvider())

      activateRgiUnicodeProvider(terminal)
      expect(terminal.unicode.activeVersion).toBe('11-rgi')
      expect(registered.map((provider) => provider.version)).toEqual(['11-rgi'])

      activateRgiUnicodeProvider(terminal)
      expect(registered.length, 'activeVersion 已就位时不得重复注册').toBe(1)
    })

    it("缺 '11' 基表(Unicode11Addon 未加载):退回 '11',不注册自定义表", () => {
      const { terminal, registered } = makeTerminalStub(undefined)

      activateRgiUnicodeProvider(terminal)
      expect(terminal.unicode.activeVersion).toBe('11')
      expect(registered.length).toBe(0)
    })
  })
})
