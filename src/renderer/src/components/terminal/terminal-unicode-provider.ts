// Ported from stablyai/orca src/shared/terminal/appearance/terminal-unicode-provider.ts (MIT)
// Why: agent CLI(pi)按 RGI emoji 口径计宽——「窄字符 + VS16」序列(➡️ ↗️ ✔️ ⚠️ ℹ️ 等)与
// ZWJ 组合 emoji(👨‍👩‍👧 等)都算 2 格;xterm 的 Unicode11 宽度表按单个码点查 EAW,这些字符
// 基码不是 East Asian Wide,整序列只消费 1 格。pi 把内容与行尾自绘滚动条拼进同一行字符串靠
// 字符流推进列位置,行内每差一格,滚动条竖线就整体左移一格(见
// docs/issues/2026-11-23-emoji-wide-char-misalignment.md「滚动条竖线左移」节)。
// xterm 的 charProperties 是序列感知 API(参数带前一字符的打包属性),本 provider 在 Unicode11
// 基表之上把两类序列并回 pi 的口径;ZWJ 段为 Orca 原版,VS16 段为本项目增量。

import type { IUnicodeHandling, IUnicodeVersionProvider } from '@xterm/xterm'

export type XtermUnicodeServiceCore = {
  unicodeService?: {
    _providers?: Record<string, IUnicodeVersionProvider>
  }
}

type XtermTerminalWithUnicodeCore = {
  unicode: IUnicodeHandling
  _core?: XtermUnicodeServiceCore
}

// 自定义版本号:基于 Unicode 11 基表 + RGI emoji 序列对齐
const RGI_UNICODE_VERSION = '11-rgi'
const UNICODE11_VERSION = '11'
const ZERO_WIDTH_JOINER = 0x200d
const VARIATION_SELECTOR_16 = 0xfe0f

function extractWidth(properties: number): 0 | 1 | 2 {
  return ((properties >> 1) & 3) as 0 | 1 | 2
}

function extractCharKind(properties: number): number {
  return properties >> 3
}

function createProperties(charKind: number, width: 0 | 1 | 2, shouldJoin: boolean): number {
  return ((charKind & 0xffffff) << 3) | ((width & 3) << 1) | (shouldJoin ? 1 : 0)
}

class RgiAlignedUnicodeProvider implements IUnicodeVersionProvider {
  public readonly version = RGI_UNICODE_VERSION

  public constructor(private readonly baseProvider: IUnicodeVersionProvider) {}

  public wcwidth(codepoint: number): 0 | 1 | 2 {
    return this.baseProvider.wcwidth(codepoint)
  }

  public charProperties(codepoint: number, preceding: number): number {
    const precedingWidth = extractWidth(preceding)
    const precedingKind = extractCharKind(preceding)

    if (codepoint === ZERO_WIDTH_JOINER && precedingWidth > 0) {
      return createProperties(ZERO_WIDTH_JOINER, precedingWidth, true)
    }

    if (precedingKind === ZERO_WIDTH_JOINER && precedingWidth > 0 && this.wcwidth(codepoint) > 0) {
      // CLIs budget ZWJ emoji as one wide glyph; Unicode11 otherwise advances for both emoji parts.
      return createProperties(codepoint, precedingWidth, true)
    }

    if (codepoint === VARIATION_SELECTOR_16 && precedingWidth === 1) {
      // 本项目增量(Orca 原版无):pi 按 RGI emoji 把「窄基码 + VS16」序列计 2 格,而基础表
      // 让 VS16 零宽 join 进前格、整序列仍 1 格。让 VS16 自占 1 格,序列共 2 格,与 pi 一致。
      // precedingWidth === 1 的门槛:已是宽格的 emoji(如 ✅️)不被二次加宽,仍走基础 join。
      return createProperties(codepoint, 1, false)
    }

    return this.baseProvider.charProperties(codepoint, preceding)
  }
}

export function activateRgiUnicodeProvider(terminal: XtermTerminalWithUnicodeCore): void {
  const { unicode } = terminal
  if (unicode.activeVersion === RGI_UNICODE_VERSION) {
    return
  }

  const baseProvider = terminal._core?.unicodeService?._providers?.[UNICODE11_VERSION]
  if (!baseProvider) {
    unicode.activeVersion = UNICODE11_VERSION
    return
  }

  if (!unicode.versions.includes(RGI_UNICODE_VERSION)) {
    unicode.register(new RgiAlignedUnicodeProvider(baseProvider))
  }
  unicode.activeVersion = RGI_UNICODE_VERSION
}
