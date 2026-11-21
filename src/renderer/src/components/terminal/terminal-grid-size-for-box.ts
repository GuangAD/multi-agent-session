// Ported from stablyai/orca src/renderer/src/lib/pane-manager/terminal-fit/terminal-grid-size-for-box.ts (MIT)
// Why: 官方 addon-fit 的提案随当前列数漂移(css.cell = canvas.width/cols 随 cols 舍入变化),
// 同一盒子会提出不同网格;本函数让「给定盒子 + cell 尺寸 → 网格」成为纯函数,配合
// StableCellFitAddon 的 device/dpr cell 尺寸,消除右侧空白与 fit 抖动(向下取整,网格永不溢出容器)。
// metrics 与 Orca 全同形(scrollback + scrollbar 对象;scrollback 0 或 showScrollbar false → 不预留,
// 否则用 scrollbar.width,缺省回退 DEFAULT_SCROLL_BAR_WIDTH=14 = xterm 默认 verticalScrollbarSize)。
// T3.5 布局对齐:恢复同形的原因——此前裁剪成「scrollbar 直传宽度数字、调用方传 0」的前提是
// 「未配置自定义滚动条宽」;use-terminal.ts 现按 Orca 配置 scrollbar:{width:7},xterm 会自绘
// VS Code 式滚动条占沟槽,网格必须预留该宽度,否则滚动条压在末列上(裁剪前提不再成立)。
// Mirrors FitAddon.proposeDimensions in @xterm/addon-fit 0.12.0-beta.332 (xterm 6.1.0-beta.336).
const MINIMUM_COLS = 2
const MINIMUM_ROWS = 1
const DEFAULT_SCROLL_BAR_WIDTH = 14

export type TerminalFitMetrics = {
  cell: { width: number; height: number }
  padding: { top: number; right: number; bottom: number; left: number }
  scrollback: number | undefined
  scrollbar: { showScrollbar?: boolean; width?: number } | undefined
}

/** The grid a terminal would fit to if its xterm host element had this box. */
export function terminalGridSizeForBox(
  box: { width: number; height: number },
  metrics: TerminalFitMetrics
): { cols: number; rows: number } {
  const { cell, padding, scrollback, scrollbar } = metrics
  const scrollbarWidth =
    scrollback === 0 || !(scrollbar?.showScrollbar ?? true)
      ? 0
      : (scrollbar?.width ?? DEFAULT_SCROLL_BAR_WIDTH)
  // FitAddon reads the host's computed width/height with parseInt, which truncates.
  const width = Math.max(0, Math.trunc(box.width)) - padding.left - padding.right - scrollbarWidth
  const height = Math.max(0, Math.trunc(box.height)) - padding.top - padding.bottom
  return {
    cols: Math.max(MINIMUM_COLS, Math.floor(width / cell.width)),
    rows: Math.max(MINIMUM_ROWS, Math.floor(height / cell.height))
  }
}
