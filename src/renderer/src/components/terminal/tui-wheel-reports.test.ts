// tui-wheel-reports 纯逻辑守卫:wheel 事件 → 报告条数解析(移植 Orca 同名文件的核心)
// 期望值独立事实源 = Orca 算法本体的可手推公式:
// - 连续型(无 legacy wheelDelta 的像素输入):|deltaY| / DEFAULT_TERMINAL_CELL_HEIGHT(16),
//   小数进位累积到下一事件(trunc 后余数存 state.pendingRows)
// - 有级滚轮(legacy wheelDelta ≥ 100):burst 路径,distanceRows = max(1, |deltaY|/16, |wheelDelta|/120),
//   压缩曲线 min(6, 1 + log2(rows) × 1.6),首事件无间隔 → 突发加成 0
// - line-mode 输入(deltaMode=LINE):直接按行数计,再过压缩曲线
import { describe, expect, it } from 'vitest'
import {
  createTerminalTuiMouseWheelDistanceState,
  resolveTerminalTuiMouseWheelReportCount,
  resolveTerminalWheelDirection
} from './tui-wheel-reports'

describe('resolveTerminalWheelDirection 方向归一', () => {
  it('deltaY<0 → -1(向上);deltaY≥0 → 1(向下,含水平滚轮的 deltaY=0)', () => {
    expect(resolveTerminalWheelDirection({ deltaY: -120 })).toBe(-1)
    expect(resolveTerminalWheelDirection({ deltaY: 0 })).toBe(1)
    expect(resolveTerminalWheelDirection({ deltaY: 100 })).toBe(1)
  })
})

describe('resolveTerminalTuiMouseWheelReportCount 报告数解析', () => {
  it('连续型像素距离(无 legacy wheelDelta):|deltaY|/16 带进位逐事件累积', () => {
    const state = createTerminalTuiMouseWheelDistanceState()
    // 120px ÷ 16px/行 = 7.5 → 本事件 trunc(0 + 7.5) = 7,余 0.5 进位
    expect(resolveTerminalTuiMouseWheelReportCount({ deltaY: 120 }, state)).toBe(7)
    expect(state.pendingRows).toBeCloseTo(0.5, 10)
    // 下一事件 0.5 + 7.5 = 8 → 8 个报告,进位清零
    expect(resolveTerminalTuiMouseWheelReportCount({ deltaY: 120 }, state)).toBe(8)
    expect(state.pendingRows).toBeCloseTo(0, 10)
  })

  it('有级滚轮(wheelDeltaY=120、deltaY=100px):burst 路径压缩曲线,首事件 5 个报告', () => {
    const state = createTerminalTuiMouseWheelDistanceState()
    // distanceRows = max(1, 100/16=6.25, 120/120=1) = 6.25
    // compress = min(6, 1 + log2(6.25)×1.6) ≈ 5.23;首事件无时间间隔 → 突发加成 0 → trunc = 5
    expect(
      resolveTerminalTuiMouseWheelReportCount({ deltaY: 100, wheelDeltaY: 120, timeStamp: 0 }, state)
    ).toBe(5)
  })

  it('line-mode 输入(deltaMode=LINE):deltaY 3 行 → 3 个报告', () => {
    const state = createTerminalTuiMouseWheelDistanceState()
    // 非 pixel 即非连续型:rowsFromDelta = 3;compress(3) = 1 + log2(3)×1.6 ≈ 3.54 → trunc 3
    expect(resolveTerminalTuiMouseWheelReportCount({ deltaY: 3, deltaMode: 1 }, state)).toBe(3)
  })

  it('方向反转:进位与突发连击清零,反向按净距离重新累计', () => {
    const state = createTerminalTuiMouseWheelDistanceState()
    resolveTerminalTuiMouseWheelReportCount({ deltaY: 120 }, state) // +7,进位 0.5
    // 反转清进位:本事件 trunc(0 + 7.5) = 7(而非 8),余 0.5
    expect(resolveTerminalTuiMouseWheelReportCount({ deltaY: -120 }, state)).toBe(7)
    expect(state.pendingDirection).toBe(-1)
    expect(state.pendingRows).toBeCloseTo(0.5, 10)
  })
})
