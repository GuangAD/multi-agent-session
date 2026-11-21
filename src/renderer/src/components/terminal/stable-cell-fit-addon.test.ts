// StableCellFitAddon / terminalGridSizeForBox 守卫(T3.5 评审期 Fix-B 右侧空白治理 + 布局对齐)
// 期望值全部手算字面量。基准:device.cell.width=10.04/dpr=1、盒子 1280;scrollback=10000、
// scrollbar={width:7} 与 use-terminal.ts 的 Terminal 构造同值(T3.5 布局对齐按 Orca 配置了
// 细滚动条,网格预留 7px → (1280-7)/10.04 = 126.79 → 126 列)。
// 桩 terminal 只提供被测代码读取的面:dimensions(device/css cell)、element(ownerDocument
// → defaultView:dpr 与 getComputedStyle 返回盒子/padding 数字)、options(scrollback/scrollbar,
// addon 按 Orca 同形回传给 terminalGridSizeForBox);不起真 DOM。
// 核心差异被钉住:官方 addon-fit 读 css.cell(= canvas.width/cols 随当前列数舍入漂移),
// 同一盒子提案不稳;StableCellFitAddon 读 device.cell/dpr(与当前列数解耦),提案是盒子的纯函数。
import { describe, expect, it } from 'vitest'
import type { Terminal } from '@xterm/xterm'
import { StableCellFitAddon } from './stable-cell-fit-addon'
import { terminalGridSizeForBox } from './terminal-grid-size-for-box'

type Padding = { top: number; right: number; bottom: number; left: number }
type ScrollbarOption = { showScrollbar?: boolean; width?: number }

// 构桩:返回原始对象以便用例对 css.cell 做漂移变异(case 4),Terminal 面在 activate 时断言
function makeStubTerminal(input: {
  box: { width: number; height: number }
  padding?: Partial<Padding>
  // 缺省 = 未渲染(device cell 全 0,走 css.cell 退回分支)
  deviceCell?: { width: number; height: number }
  cssCell: { width: number; height: number }
  dpr?: number
  // 缺省 = use-terminal.ts 的构造值 {width:7};用例可改传 showScrollbar:false(不预留)
  // 钉住 addon 对 options 的透传(「未配置 → ?? 回退默认宽 14」分支在纯函数直测覆盖)
  scrollback?: number
  scrollbar?: ScrollbarOption
}): { stub: Terminal; raw: { dimensions: { css: { cell: { width: number; height: number } } } } } {
  const pad: Padding = { top: 0, right: 0, bottom: 0, left: 0, ...input.padding }
  const parent = {} as HTMLElement
  const view = {
    devicePixelRatio: input.dpr ?? 1,
    getComputedStyle: (el: unknown) => ({
      getPropertyValue: (prop: string): string => {
        if (el !== parent) {
          // terminal.element 自身样式:四向 padding
          switch (prop) {
            case 'padding-top':
              return String(pad.top)
            case 'padding-right':
              return String(pad.right)
            case 'padding-bottom':
              return String(pad.bottom)
            case 'padding-left':
              return String(pad.left)
            default:
              return ''
          }
        }
        // parentElement 样式:盒子宽高(getComputedStyle 的 parseInt 取整口径由被测代码负责)
        if (prop === 'width') {
          return String(input.box.width)
        }
        if (prop === 'height') {
          return String(input.box.height)
        }
        return ''
      }
    })
  }
  const raw = {
    dimensions: {
      device: { cell: input.deviceCell ?? { width: 0, height: 0 } },
      css: { cell: input.cssCell }
    }
  }
  const element = { parentElement: parent, ownerDocument: { defaultView: view } }
  const stub = {
    element,
    dimensions: raw.dimensions,
    options: {
      scrollback: input.scrollback ?? 10000,
      scrollbar: input.scrollbar ?? { width: 7 }
    }
  } as unknown as Terminal
  return { stub, raw: raw as { dimensions: { css: { cell: { width: number; height: number } } } } }
}

function activatedAddon(terminal: Terminal): StableCellFitAddon {
  const addon = new StableCellFitAddon()
  addon.activate(terminal)
  return addon
}

describe('StableCellFitAddon.proposeDimensions(Fix-B:提案 = 盒子的纯函数)', () => {
  it('用例 1:device.cell 存在时取 device/dpr,不取 css.cell(与官方 addon-fit 的核心分叉)', () => {
    // 手算:device.cell.width=10.04、dpr=1 → 预留滚动条 7 → (1280-7)/10.04 = 126.79 → 126 列;
    // 500/20.08 = 24.90 → 24 行。若读 css.cell(漂移值 10.75)会得 118 列——二者分叉被钉死。
    const { stub } = makeStubTerminal({
      box: { width: 1280, height: 500 },
      deviceCell: { width: 10.04, height: 20.08 },
      cssCell: { width: 10.75, height: 21.5 }
    })
    expect(activatedAddon(stub).proposeDimensions()).toEqual({ cols: 126, rows: 24 })

    // dpr≠1 同样成立:device 像素 20.08 / dpr 2 = 10.04 css px → 同一提案(归一化正确)
    const { stub: hidpi } = makeStubTerminal({
      box: { width: 1280, height: 500 },
      deviceCell: { width: 20.08, height: 40.16 },
      cssCell: { width: 10.75, height: 21.5 },
      dpr: 2
    })
    expect(activatedAddon(hidpi).proposeDimensions()).toEqual({ cols: 126, rows: 24 })
  })

  it('用例 2:device.cell 缺失(全 0,未渲染)→ 退回 css.cell', () => {
    // 手算:device 0 → width>0 不成立 → css.cell.width=10.04 → (1280-7)/10.04 = 126.79 → 126
    const { stub } = makeStubTerminal({
      box: { width: 1280, height: 500 },
      cssCell: { width: 10.04, height: 20.08 }
    })
    expect(activatedAddon(stub).proposeDimensions()).toEqual({ cols: 126, rows: 24 })
  })

  it('用例 3:propose = floor((盒子-padding-scrollbar)/cell) 向下取整,下限夹 2×1', () => {
    // 手算:padding 左 10 右 12、上 4 下 4、scrollbar 7(use-terminal 同值)→
    // (1280-22-7)/10.04 = 124.60 → 124;(500-8)/20.08 = 24.50 → 24
    const { stub } = makeStubTerminal({
      box: { width: 1280, height: 500 },
      padding: { left: 10, right: 12, top: 4, bottom: 4 },
      deviceCell: { width: 10.04, height: 20.08 },
      cssCell: { width: 10.04, height: 20.08 }
    })
    expect(activatedAddon(stub).proposeDimensions()).toEqual({ cols: 124, rows: 24 })

    // 极小盒子:整除商为 0 → 夹最小网格 2×1(xterm 下限,与官方 addon-fit 口径一致)
    const { stub: tiny } = makeStubTerminal({
      box: { width: 16, height: 12 },
      deviceCell: { width: 10.04, height: 20.08 },
      cssCell: { width: 10.04, height: 20.08 }
    })
    expect(activatedAddon(tiny).proposeDimensions()).toEqual({ cols: 2, rows: 1 })
  })

  it('用例 3.5(布局对齐):terminal.options.scrollbar 透传给网格计算', () => {
    // showScrollbar:false → 不预留 → 1280/10.04 = 127.49 → 127(与默认 126 分叉,钉住透传)
    const { stub: noScrollbar } = makeStubTerminal({
      box: { width: 1280, height: 500 },
      deviceCell: { width: 10.04, height: 20.08 },
      cssCell: { width: 10.04, height: 20.08 },
      scrollbar: { showScrollbar: false, width: 7 }
    })
    expect(activatedAddon(noScrollbar).proposeDimensions()).toEqual({ cols: 127, rows: 24 })
  })

  it('用例 4:同一盒子两次 propose 一致;css.cell 漂移(官方 addon-fit 会抖动的场景)提案不变', () => {
    const { stub, raw } = makeStubTerminal({
      box: { width: 1280, height: 500 },
      deviceCell: { width: 10.04, height: 20.08 },
      cssCell: { width: 10.04, height: 20.08 }
    })
    const addon = activatedAddon(stub)
    const first = addon.proposeDimensions()
    expect(first).toEqual({ cols: 126, rows: 24 })
    expect(addon.proposeDimensions()).toEqual(first)

    // 模拟漂移源:当前列数变化 → 官方口径的 css.cell 舍入值改变(10.04 → 10.75);
    // 本 addon 读 device.cell(与列数无关)→ 提案必须纹丝不动
    raw.dimensions.css.cell = { width: 10.75, height: 21.5 }
    expect(addon.proposeDimensions()).toEqual({ cols: 126, rows: 24 })
  })
})

describe('terminalGridSizeForBox(纯函数直测:公式各项)', () => {
  const cell = { width: 10.04, height: 20.08 }
  const noPad = { top: 0, right: 0, bottom: 0, left: 0 }

  it('盒子小数经 Math.trunc 截断,scrollbar 宽度参与扣除', () => {
    // 手算:trunc(1280.9)=1280;scrollbar 14 → (1280-14)/10.04 = 126.09 → 126;
    // 行:trunc(500.9)=500 → 500/20.08 = 24.90 → 24
    expect(
      terminalGridSizeForBox(
        { width: 1280.9, height: 500.9 },
        { cell, padding: noPad, scrollback: 10000, scrollbar: { width: 14 } }
      )
    ).toEqual({ cols: 126, rows: 24 })
    // 同一盒子 scrollbar 传 7(use-terminal 同值)→ trunc 1284 → (1284-7)/10.04 = 127.19 → 127
    // (7 与 14 在此盒子上分叉:14 会得 (1284-14)/10.04 = 126.49 → 126,证明宽度真实参与扣除)
    expect(
      terminalGridSizeForBox(
        { width: 1284.9, height: 500.9 },
        { cell, padding: noPad, scrollback: 10000, scrollbar: { width: 7 } }
      )
    ).toEqual({ cols: 127, rows: 24 })
  })

  it('scrollbar 缺省回退 14(xterm 默认 verticalScrollbarSize);scrollback 0 / showScrollbar false → 不预留', () => {
    // 未配置 scrollbar → ?? DEFAULT_SCROLL_BAR_WIDTH=14 → (1280-14)/10.04 → 126
    expect(
      terminalGridSizeForBox(
        { width: 1280, height: 500 },
        { cell, padding: noPad, scrollback: 10000, scrollbar: undefined }
      )
    ).toEqual({ cols: 126, rows: 24 })
    // scrollback 0(无可滚内容,Orca 同条件)→ 不预留 → 1280/10.04 = 127.49 → 127
    expect(
      terminalGridSizeForBox(
        { width: 1280, height: 500 },
        { cell, padding: noPad, scrollback: 0, scrollbar: { width: 14 } }
      )
    ).toEqual({ cols: 127, rows: 24 })
    // showScrollbar false → 不预留 → 同 127
    expect(
      terminalGridSizeForBox(
        { width: 1280, height: 500 },
        { cell, padding: noPad, scrollback: 10000, scrollbar: { showScrollbar: false, width: 14 } }
      )
    ).toEqual({ cols: 127, rows: 24 })
  })

  it('padding + scrollbar 吃穿盒子 → 负可用宽度夹回 0,网格下限 2×1(永不溢出容器)', () => {
    // 手算:trunc(8.4)=8;8-3-3-14 = -12 → Math.max(0,-12)=0 → 0/10.04=0 → max(2,0)=2;
    // 8-1-1=6 → 6/20.08=0 → max(1,0)=1
    expect(
      terminalGridSizeForBox(
        { width: 8.4, height: 8.4 },
        {
          cell,
          padding: { top: 1, right: 3, bottom: 1, left: 3 },
          scrollback: 10000,
          scrollbar: { width: 14 }
        }
      )
    ).toEqual({ cols: 2, rows: 1 })
  })
})
