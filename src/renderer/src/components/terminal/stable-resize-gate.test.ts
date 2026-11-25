// 接缝 createStableResizeGate(模块行为)契约测试:spec T5 覆盖用例 1-3(穷举抖动合并与稳定判定)
// 期望值来源:T5.md 测试规格(手算回调次数)+ brief 第 5 节(静默期 200ms 量级)
// timer 语义与 T3 合并器同款裁定:内部 setTimeout/clearTimeout,vitest fake timers 驱动,不加注入参数
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createStableResizeGate } from './stable-resize-gate'

// brief 第 5 节:后台 fit 的稳定计时参数(200 毫秒量级)
const QUIET_MS = 200

describe('stable-resize-gate · createStableResizeGate', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('用例 1:三次 notifyResize 间隔小于静默期 → 静默期满 onSettled 恰一次(手算:每次调用都续期,只按最后一次起算满 200ms)', () => {
    const onSettled = vi.fn()
    const gate = createStableResizeGate({ quietMs: QUIET_MS, onSettled })
    gate.notifyResize()
    vi.advanceTimersByTime(100) // t=100 < 静默期:续期
    gate.notifyResize()
    vi.advanceTimersByTime(100) // t=200 < 距上次调用的静默期:续期
    gate.notifyResize()
    vi.advanceTimersByTime(199) // t=399:距最后一次调用 199ms,仍未满
    expect(onSettled, '静默期未满:零回调').not.toHaveBeenCalled()
    vi.advanceTimersByTime(1) // t=400:距最后一次调用恰 200ms
    expect(onSettled, '静默期满:抖动收敛,恰回调一次').toHaveBeenCalledTimes(1)
    gate.reset()
  })

  it('用例 2:静默期满回调后再 notifyResize → 再次触发一次(手算:两轮各一次,共两次——稳定门可重入下一轮)', () => {
    const onSettled = vi.fn()
    const gate = createStableResizeGate({ quietMs: QUIET_MS, onSettled })
    gate.notifyResize()
    vi.advanceTimersByTime(QUIET_MS)
    expect(onSettled, '第一轮稳定:回调一次').toHaveBeenCalledTimes(1)
    gate.notifyResize() // 新一轮抖动(窗口又被拖动)
    vi.advanceTimersByTime(QUIET_MS)
    expect(onSettled, '第二轮稳定:再次回调一次,共两次').toHaveBeenCalledTimes(2)
    gate.reset()
  })

  it('用例 3:reset 后推进时间 → 零回调(约定:测试收尾清计时器,静默期再久也不发)', () => {
    const onSettled = vi.fn()
    const gate = createStableResizeGate({ quietMs: QUIET_MS, onSettled })
    gate.notifyResize()
    gate.reset()
    vi.advanceTimersByTime(QUIET_MS * 10)
    expect(onSettled, 'reset 后不得再有回调').not.toHaveBeenCalled()
  })
})
