// mouse-wheel-replay 守卫:mouse mode 下把 wheel 事件放大重放为 N 个 line-mode 克隆事件
// (移植 Orca pane-terminal-mouse-wheel 的 state + queue/drain + 判定;node 环境对 WheelEvent
// 全局打桩,重放经 queueMicrotask 排空,测试以 await 让出微任务后断言 dispatch 序列)
import { beforeAll, describe, expect, it, vi } from 'vitest'
import {
  createTerminalMouseWheelReplayState,
  replayTerminalMouseWheel,
  shouldReplayTerminalMouseWheel
} from './mouse-wheel-replay'
import type { TerminalWheelTarget } from './mouse-wheel-replay'

// WheelEvent 桩:克隆经 new WheelEvent(type, init) 构造(node 无此全局);形状 = init 面拷贝
beforeAll(() => {
  class FakeWheelEvent {
    type: string
    constructor(type: string, init: WheelEventInit) {
      this.type = type
      Object.assign(this, init)
    }
  }
  vi.stubGlobal('WheelEvent', FakeWheelEvent)
})

type DispatchedClone = { deltaY: number; deltaMode: number }

// terminal 桩:mouse mode 判定 + element.dispatchEvent 记录器(rows 仅喂 cellHeight 回退路径)
function makeTarget(dispatched: DispatchedClone[], trackingMode: 'none' | 'drag' = 'drag') {
  const target = {
    modes: { mouseTrackingMode: trackingMode },
    rows: 24,
    element: {
      dispatchEvent: (event: unknown) => {
        dispatched.push(event as DispatchedClone)
        return true
      }
    }
  }
  return target as unknown as TerminalWheelTarget
}

function makeEvent(deltaY: number): WheelEvent {
  return { deltaY } as WheelEvent
}

// 重放经 queueMicrotask 排空;让出一个微任务即排空完成
async function drain(): Promise<void> {
  await Promise.resolve()
}

describe('shouldReplayTerminalMouseWheel 重放判定', () => {
  it('mouseTrackingMode=none → false;非 none 且非重放且 deltaY≠0 → true', () => {
    const dispatched: DispatchedClone[] = []
    expect(shouldReplayTerminalMouseWheel(makeTarget(dispatched, 'none'), makeEvent(120))).toBe(
      false
    )
    expect(shouldReplayTerminalMouseWheel(makeTarget(dispatched, 'drag'), makeEvent(120))).toBe(true)
  })

  it('重放克隆事件 → false(放大不递归);deltaY=0(水平滚轮)→ false', async () => {
    const dispatched: DispatchedClone[] = []
    const state = createTerminalMouseWheelReplayState()
    const terminal = makeTarget(dispatched, 'drag')
    replayTerminalMouseWheel(state, terminal, makeEvent(120))
    await drain()
    expect(dispatched.length).toBeGreaterThan(0)
    expect(
      shouldReplayTerminalMouseWheel(terminal, dispatched[0] as unknown as WheelEvent)
    ).toBe(false)
    expect(shouldReplayTerminalMouseWheel(terminal, makeEvent(0))).toBe(false)
  })
})

describe('replayTerminalMouseWheel 重放与排空', () => {
  it('120px 无 legacy delta → 7 个 line-mode 克隆,方向归一 +1,事件带重放标记', async () => {
    const dispatched: DispatchedClone[] = []
    const state = createTerminalMouseWheelReplayState()
    replayTerminalMouseWheel(state, makeTarget(dispatched), makeEvent(120))
    await drain()
    expect(dispatched.length).toBe(7)
    for (const clone of dispatched) {
      expect(clone.deltaMode).toBe(1) // DOM_DELTA_LINE
      expect(clone.deltaY).toBe(1)
    }
    expect(
      (dispatched[0] as unknown as Record<string, unknown>)['__replayedTerminalWheelEvent']
    ).toBe(true)
  })

  it('反向:deltaY<0 → 克隆 deltaY=-1', async () => {
    const dispatched: DispatchedClone[] = []
    const state = createTerminalMouseWheelReplayState()
    replayTerminalMouseWheel(state, makeTarget(dispatched), makeEvent(-120))
    await drain()
    expect(dispatched.length).toBe(7)
    for (const clone of dispatched) {
      expect(clone.deltaY).toBe(-1)
    }
  })

  it('排空前 mouse mode 关闭 → pending 丢弃,零 dispatch', async () => {
    const dispatched: DispatchedClone[] = []
    const state = createTerminalMouseWheelReplayState()
    const terminal = makeTarget(dispatched, 'drag')
    replayTerminalMouseWheel(state, terminal, makeEvent(120))
    // 桩面改写(IModes 上 mouseTrackingMode readonly,测试取可变投影)
    ;(terminal.modes as { mouseTrackingMode: 'none' | 'drag' }).mouseTrackingMode = 'none'
    await drain()
    expect(dispatched).toEqual([])
  })

  it('排空前方向反转 → 旧方向 pending 清零,只重放新方向的克隆', async () => {
    const dispatched: DispatchedClone[] = []
    const state = createTerminalMouseWheelReplayState()
    const terminal = makeTarget(dispatched, 'drag')
    replayTerminalMouseWheel(state, terminal, makeEvent(120)) // +7 排队
    replayTerminalMouseWheel(state, terminal, makeEvent(-120)) // 反转:清 +pending,排队 -7
    await drain()
    expect(dispatched.length).toBe(7)
    for (const clone of dispatched) {
      expect(clone.deltaY).toBe(-1)
    }
  })

  it('无 target(element 缺失且 currentTarget 缺失)→ 不排队、排空零 dispatch、不抛', async () => {
    const dispatched: DispatchedClone[] = []
    const state = createTerminalMouseWheelReplayState()
    const terminal = makeTarget(dispatched, 'drag')
    ;(terminal as unknown as { element: unknown }).element = null
    expect(() => replayTerminalMouseWheel(state, terminal, makeEvent(120))).not.toThrow()
    await drain()
    expect(dispatched).toEqual([])
  })
})
