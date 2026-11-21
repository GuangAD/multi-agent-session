// Ported from stablyai/orca src/renderer/src/lib/pane-manager/terminal-input/pane-terminal-mouse-wheel.ts (MIT)
// Why: mouse 报告模式下把一个 wheel 事件按距离解析成 N 个 line-mode(deltaMode=LINE、deltaY=±1)
// 克隆事件,queueMicrotask 后逐个 dispatchEvent 给 terminal 元素——xterm 收到重放事件走其内建
// mouse 路径逐条转报告发 TUI;原事件被拦截(use-terminal 分支 2 返回 false),不再走带 dampen
// 的默认路径。重放克隆带标记:再入 handler 时识别为已重放,交 xterm 默认,防放大递归。
// 裁剪点:去掉 multiplier 选项/设置读取,倍数固定为 tui-wheel-reports.ts 的
// TERMINAL_TUI_MOUSE_WHEEL_MULTIPLIER;去掉 enable-mouse-events CSS class 依赖,以
// terminal.modes.mouseTrackingMode !== 'none' 判定;Orca 的 attachTerminalMouseWheelMultiplier
// (整体挂钩)拆为「state + 单事件分支函数」——xterm attachCustomWheelEventHandler 是单槽
// (后挂替换先挂),须与 Shift+滚轮分支共用一个 handler,由 use-terminal 三分支调度。
import type { Terminal } from '@xterm/xterm'
import {
  createTerminalTuiMouseWheelDistanceState,
  resolveTerminalTuiMouseWheelReportCount,
  resolveTerminalWheelDirection
} from './tui-wheel-reports'
import type { TerminalTuiMouseWheelDistanceState } from './tui-wheel-reports'

const REPLAYED_WHEEL_EVENT_PROPERTY = '__replayedTerminalWheelEvent'
const DOM_DELTA_LINE = 1

export type TerminalWheelTarget = Pick<Terminal, 'element' | 'rows'> & {
  modes: Pick<Terminal['modes'], 'mouseTrackingMode'>
}

type ReplayedWheelEvent = WheelEvent & {
  [REPLAYED_WHEEL_EVENT_PROPERTY]?: boolean
}

export type TerminalMouseWheelReplayState = {
  distance: TerminalTuiMouseWheelDistanceState
  drainScheduled: boolean
  pendingDirection: -1 | 0 | 1
  pendingEvent: WheelEvent | null
  pendingReports: number
  pendingTarget: EventTarget | null
}

export function createTerminalMouseWheelReplayState(): TerminalMouseWheelReplayState {
  return {
    distance: createTerminalTuiMouseWheelDistanceState(),
    drainScheduled: false,
    pendingDirection: 0,
    pendingEvent: null,
    pendingReports: 0,
    pendingTarget: null
  }
}

function isReplayedWheelEvent(event: WheelEvent): boolean {
  return (event as ReplayedWheelEvent)[REPLAYED_WHEEL_EVENT_PROPERTY] === true
}

function markReplayedWheelEvent(event: WheelEvent): void {
  Object.defineProperty(event, REPLAYED_WHEEL_EVENT_PROPERTY, {
    configurable: true,
    value: true
  })
}

function cloneWheelReportEvent(event: WheelEvent): WheelEvent {
  const clone = new WheelEvent(event.type, {
    bubbles: event.bubbles,
    cancelable: event.cancelable,
    composed: event.composed,
    view: event.view,
    detail: event.detail,
    screenX: event.screenX,
    screenY: event.screenY,
    clientX: event.clientX,
    clientY: event.clientY,
    ctrlKey: event.ctrlKey,
    altKey: event.altKey,
    shiftKey: event.shiftKey,
    metaKey: event.metaKey,
    button: event.button,
    buttons: event.buttons,
    relatedTarget: event.relatedTarget,
    deltaX: 0,
    deltaY: event.deltaY < 0 ? -1 : 1,
    deltaZ: 0,
    deltaMode: DOM_DELTA_LINE
  })
  markReplayedWheelEvent(clone)
  return clone
}

function resolveTerminalWheelCellHeight(terminal: TerminalWheelTarget): number | undefined {
  if (typeof terminal.element?.querySelector !== 'function') {
    return undefined
  }
  const screen = terminal.element?.querySelector<HTMLElement>('.xterm-screen')
  const rect = screen?.getBoundingClientRect()
  if (!rect || rect.height <= 0 || terminal.rows <= 0) {
    return undefined
  }
  return rect.height / terminal.rows
}

// Orca shouldMultiplyTerminalMouseWheel 的等价判定:CSS class 换成 modes;
// shift 分支由 use-terminal 的分支 1 先行消费,此处不再查 shiftKey
export function shouldReplayTerminalMouseWheel(
  terminal: TerminalWheelTarget,
  event: WheelEvent
): boolean {
  return (
    terminal.modes.mouseTrackingMode !== 'none' &&
    !isReplayedWheelEvent(event) &&
    event.deltaY !== 0
  )
}

function drainTerminalTuiWheelReports(
  state: TerminalMouseWheelReplayState,
  terminal: TerminalWheelTarget
): void {
  const target = state.pendingTarget
  const event = state.pendingEvent
  if (!target || !event || state.pendingReports <= 0) {
    state.drainScheduled = false
    return
  }

  if (terminal.modes.mouseTrackingMode === 'none') {
    state.pendingReports = 0
    state.drainScheduled = false
    state.pendingDirection = 0
    state.pendingEvent = null
    state.pendingTarget = null
    return
  }

  const reportsToDispatch = state.pendingReports
  for (let i = 0; i < reportsToDispatch; i += 1) {
    target.dispatchEvent(cloneWheelReportEvent(event))
  }
  state.pendingReports = 0
  state.drainScheduled = false
  state.pendingDirection = 0
  state.pendingEvent = null
  state.pendingTarget = null
}

function queueTerminalTuiWheelReports(
  state: TerminalMouseWheelReplayState,
  terminal: TerminalWheelTarget,
  target: EventTarget,
  event: WheelEvent,
  reportCount: number
): void {
  if (reportCount <= 0) {
    return
  }

  const direction = resolveTerminalWheelDirection(event)
  if (state.pendingDirection !== 0 && state.pendingDirection !== direction) {
    state.pendingReports = 0
  }

  state.pendingDirection = direction
  state.pendingEvent = event
  state.pendingTarget = target
  state.pendingReports += reportCount

  if (state.drainScheduled) {
    return
  }

  state.drainScheduled = true
  // Report after xterm's wheel handler, without frame caps that lose fullscreen-TUI scroll distance.
  queueMicrotask(() => {
    drainTerminalTuiWheelReports(state, terminal)
  })
}

// Orca attachTerminalMouseWheelMultiplier 的 handler 体等价物:解析报告数并入队重放。
// 返回值语义由 use-terminal 承担(分支 2 命中即 return false 拦截原事件;克隆再入落分支 3)
export function replayTerminalMouseWheel(
  state: TerminalMouseWheelReplayState,
  terminal: TerminalWheelTarget,
  event: WheelEvent
): void {
  const target = event.currentTarget instanceof EventTarget ? event.currentTarget : terminal.element
  if (!target) {
    return
  }

  // Replay resolved rows in line mode; xterm dampens small pixel deltas before emitting reports.
  const reportCount = resolveTerminalTuiMouseWheelReportCount(event, state.distance, {
    cellHeight: resolveTerminalWheelCellHeight(terminal),
    rows: terminal.rows
  })
  queueTerminalTuiWheelReports(state, terminal, target, event, reportCount)
}
