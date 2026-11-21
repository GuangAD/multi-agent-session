// Ported from stablyai/orca src/renderer/src/lib/pane-manager/terminal-fit/terminal-stable-cell-fit-addon.ts (MIT)
// Why: 官方 addon-fit 的 proposeDimensions 用 css.cell(= canvas.width/cols),该值随当前列数
// 舍入漂移——同一盒子从不同列数出发会提出不同网格,fit 反复横跳且右侧留白。本 addon 改用
// dimensions.device.cell.width / dpr(与当前列数无关),提案成为「盒子的纯函数」;配合
// terminal-grid-size-for-box 的向下取整,网格永不溢出容器。
// metrics 尾部与 Orca 全同形:传 terminal.options.scrollback/scrollbar(T3.5 布局对齐恢复;
// 此前裁剪为直传 0,前提是「未配置自定义滚动条宽」——use-terminal.ts 现按 Orca 配置
// scrollbar:{width:7},xterm 自绘滚动条占真实沟槽宽,网格须预留,否则滚动条压在末列上)。
import { FitAddon, type ITerminalDimensions } from '@xterm/addon-fit'
import type { Terminal } from '@xterm/xterm'
import { terminalGridSizeForBox } from './terminal-grid-size-for-box'

type CellSizeSource = Pick<Terminal, 'dimensions' | 'element'>

/** Use cell size independent of current columns: xterm's rounded canvas-width/cols ratio shifts with the source grid, proposing 51 from 75 cols but 52 from 52 in the same box. */
export function readTerminalStableCellSize(
  terminal: CellSizeSource
): { width: number; height: number } | null {
  const dimensions = terminal.dimensions
  if (!dimensions) {
    return null
  }
  const dpr = terminal.element?.ownerDocument.defaultView?.devicePixelRatio || 1
  const width = dimensions.device.cell.width / dpr
  const height = dimensions.device.cell.height / dpr
  if (width > 0 && height > 0) {
    return { width, height }
  }
  const css = dimensions.css.cell
  return css.width > 0 && css.height > 0 ? { width: css.width, height: css.height } : null
}

/** FitAddon whose proposal (and so fit()) is a function of the box, not of the grid it fits from. */
export class StableCellFitAddon extends FitAddon {
  private stableCellTerminal: Terminal | null = null

  public override activate(terminal: Terminal): void {
    this.stableCellTerminal = terminal
    super.activate(terminal)
  }

  public override proposeDimensions(): ITerminalDimensions | undefined {
    const terminal = this.stableCellTerminal
    const parent = terminal?.element?.parentElement
    if (!terminal?.element || !parent) {
      return undefined
    }
    const cell = readTerminalStableCellSize(terminal)
    if (!cell) {
      return undefined
    }
    const view = terminal.element.ownerDocument.defaultView
    if (!view) {
      return super.proposeDimensions()
    }
    const parentStyle = view.getComputedStyle(parent)
    const style = view.getComputedStyle(terminal.element)
    return terminalGridSizeForBox(
      {
        width: Number.parseInt(parentStyle.getPropertyValue('width'), 10) || 0,
        height: Number.parseInt(parentStyle.getPropertyValue('height'), 10) || 0
      },
      {
        cell,
        padding: {
          top: Number.parseInt(style.getPropertyValue('padding-top'), 10) || 0,
          right: Number.parseInt(style.getPropertyValue('padding-right'), 10) || 0,
          bottom: Number.parseInt(style.getPropertyValue('padding-bottom'), 10) || 0,
          left: Number.parseInt(style.getPropertyValue('padding-left'), 10) || 0
        },
        // 与 Orca 同形:回传终端自身选项——scrollback 0 / showScrollbar false → 不预留,
        // 否则用配置宽(缺省回退 14,见 terminal-grid-size-for-box.ts 文件头)
        scrollback: terminal.options.scrollback,
        scrollbar: terminal.options.scrollbar
      }
    )
  }
}
