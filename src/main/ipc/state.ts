// state 域编排层:每会话一个 hook 状态追踪器(createHookTracker)+ hook 事件喂食 + state:changed 广播
// (hook-run-state T1 最小适配:引擎已换成 hook-tracker,事件源在 T2 的 receiver 接通——本阶段
// 状态恒 seed idle 的过渡态可接受。标题/快照上行 handler 留壳防渲染层 invoke 落空,T4 随契约删除。)
import { Notification, type BrowserWindow } from 'electron'
import { IPC_CHANNELS } from './channels'
import { agentRegistry } from '../agents/agent-registry'
import { createHookTracker, type HookTracker } from '../agent-state/hook-tracker'
import { startReceiver } from '../agent-hooks/receiver'
import { ptyRegistry } from '../pty-registry'
import { sessionRecords } from '../session-store/session-records'
import { activeSession } from '../active-session'
import { shouldNotify, type NotifyKind } from '../notify'
import type { AppStore, SessionId, SessionRunState } from '../../shared/types'
import type { StateChangedEvent } from '../../shared/ipc-contract'

function sendChanged(
  getWindow: () => BrowserWindow | null,
  sessionId: SessionId,
  state: SessionRunState
): void {
  const window = getWindow()
  if (window && !window.isDestroyed()) {
    const payload: StateChangedEvent = { sessionId, state }
    window.webContents.send(IPC_CHANNELS.stateChanged, payload)
  }
}

// 后台会话通知(T11 等输入 + hook-run-state T5 任务完成;判定在 shouldNotify 接缝,此处只渲染)。
// kind = 'waiting'(等输入)/ 'done'(working→idle 任务完成);点击通知聚焦该标签页。
// 「前台」= 该会话是渲染层上报的当前标签页 **且** 窗口处于聚焦态——任一不满足都算用户没在看,
// 这时才值得提醒(最小化/切到别的应用时也算后台)。
function maybeNotify(
  store: AppStore,
  getWindow: () => BrowserWindow | null,
  sessionId: SessionId,
  kind: NotifyKind
): void {
  if (!Notification.isSupported()) {
    return
  }
  const record = sessionRecords.get(store, sessionId)
  const waiting = kind === 'waiting'
  const notification = new Notification({
    title: waiting ? '会话在等你输入' : '任务已完成',
    body: record
      ? waiting
        ? `${record.title} 已停下并等待你的输入`
        : `${record.title} 的任务已完成`
      : waiting
        ? '有一个会话正在等待你的输入'
        : '有一个后台任务已完成'
  })
  notification.on('click', () => {
    const target = getWindow()
    if (target && !target.isDestroyed()) {
      if (target.isMinimized()) {
        target.restore()
      }
      target.focus()
      target.webContents.send(IPC_CHANNELS.notifyOpen, { sessionId })
    }
  })
  notification.show()
}

export function registerStateIpc(store: AppStore, getWindow: () => BrowserWindow | null): void {
  const trackers = new Map<SessionId, HookTracker>()

  // 惰性创建(既有口径):spawn 事件在 IPC 层拿不到,而会话记录在 sessions:create 时已落进 store
  // ——首个事件到达时按 sessionId 取记录的 agentId 建追踪器。
  // seed:是否立即广播新追踪器的初始判定。
  // Why: 追踪器只广播「变化」,而重开标签页复用同一 sessionId 时渲染层还留着上一轮的 exited 红点,
  // 首个事件路径要播种一次(尚无事件 = idle)纠正它;退出路径不能播种——否则从未出过事件就退出
  // 的会话会先播一次 idle(灰点)再播 exited。
  function create(sessionId: SessionId, options: { seed: boolean }): HookTracker | null {
    const record = sessionRecords.get(store, sessionId)
    if (!record) {
      return null // 记录已删(删除会话连带关标签页):事件无处归属,静默忽略
    }
    const def = agentRegistry.getById(record.agentId)
    if (!def) {
      return null
    }
    const tracker = createHookTracker(def)
    // 通知判定(shouldNotify)看「迁移」(previous→state),闭包内记前态;
    // seed 路径 sendChanged 直调不经 onChange,天然不发(hook-run-state T5:任务完成 = working→idle)
    let previous: SessionRunState | null = null
    tracker.onChange((state) => {
      sendChanged(getWindow, sessionId, state)
      const window = getWindow()
      const focused =
        window !== null &&
        !window.isDestroyed() &&
        window.isFocused() &&
        activeSession.get() === sessionId
      const kind = shouldNotify({ previous, state, focused })
      if (kind !== null) {
        maybeNotify(store, getWindow, sessionId, kind)
      }
      previous = state
    })
    trackers.set(sessionId, tracker)
    if (options.seed) {
      sendChanged(getWindow, sessionId, tracker.state())
    }
    return tracker
  }

  // hook 事件源:loopback 接收器(hook-run-state T2)。
  // 只认有活动 PTY 的会话:退出广播时已摘掉追踪器,迟到的 hook 事件不得为死会话复活新追踪器
  // (沿 trackerForPty 的 activeSessionIds 守卫先例,守卫在 resolveHookTarget + 此处双落)。
  function trackerForHook(sessionId: SessionId): HookTracker | null {
    const existing = trackers.get(sessionId)
    if (existing) {
      return existing
    }
    return ptyRegistry.activeSessionIds().includes(sessionId)
      ? create(sessionId, { seed: true })
      : null
  }

  startReceiver({
    activeSessionIds: () => ptyRegistry.activeSessionIds(),
    onEvent: (sessionId, event) => {
      trackerForHook(sessionId)?.onHookEvent(event)
    }
  })

  ptyRegistry.onExit(({ sessionId }) => {
    // 退出路径自己去建:退出事件里 PTY 条目已先被摘(activeSessionIds 不再含它),但这里必须落地
    // exited——取不到就建,且 seed: false 不先播 idle
    const tracker = trackers.get(sessionId) ?? create(sessionId, { seed: false })
    tracker?.onExit()
    // 追踪器只服务活着的 PTY:退出广播后即摘除条目(重开标签页时首个 hook 事件再建新的)
    trackers.delete(sessionId)
  })
}
