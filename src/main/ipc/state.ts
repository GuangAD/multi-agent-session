// state 域编排层:每会话一个状态追踪器(createTracker)+ 三路喂食 + state:changed 广播
// (spec 模块划分:IPC 层只做编排,判定业务全在 agent-state/state-parser;本文件是 T5 对契约落点的
// 增补——契约只指定了接缝文件,追踪器的持有与喂食需要主进程编排处)
import { ipcMain, type BrowserWindow } from 'electron'
import { IPC_CHANNELS } from './channels'
import { agentRegistry } from '../agents/agent-registry'
import { createTracker, type Tracker } from '../agent-state/state-parser'
import { ptyRegistry } from '../pty-registry'
import { sessionRecords } from '../session-store/session-records'
import type { AppStore, SessionId, SessionRunState } from '../../shared/types'
import type {
  StateChangedEvent,
  StateSnapshotEvent,
  StateTitleEvent
} from '../../shared/ipc-contract'

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

export function registerStateIpc(store: AppStore, getWindow: () => BrowserWindow | null): void {
  const trackers = new Map<SessionId, Tracker>()

  // 惰性创建(本任务口径 3 选定的最简方式):spawn 事件在 IPC 层拿不到,而会话记录在
  // sessions:create 时已落进 store——首个事件到达时按 sessionId 取记录的 agentId 建追踪器,
  // 不必改 pty-registry 的接缝签名,也不必让 ipc/pty.ts 反过来调本层。
  // seed:是否立即广播新追踪器的初始判定。
  // Why: 追踪器只广播「变化」,而重开标签页复用同一 sessionId 时渲染层还留着上一轮的 exited 红点,
  // 首个数据/上行路径要播种一次(尚无输出 = idle)纠正它;退出路径不能播种——否则从未出过字节就退出
  // 的会话会先播一次 idle(灰点)再播 exited。
  function create(sessionId: SessionId, options: { seed: boolean }): Tracker | null {
    const record = sessionRecords.get(store, sessionId)
    if (!record) {
      return null // 记录已删(删除会话连带关标签页):上行事件无处归属,静默忽略
    }
    const def = agentRegistry.getById(record.agentId)
    if (!def) {
      return null
    }
    const tracker = createTracker(def)
    tracker.onChange((state) => sendChanged(getWindow, sessionId, state))
    trackers.set(sessionId, tracker)
    if (options.seed) {
      sendChanged(getWindow, sessionId, tracker.state())
    }
    return tracker
  }

  // 字节源:只认有活动 PTY 的会话(与 trackerForUi 同款守卫)。
  // Why: 退出广播时已摘掉追踪器,而 PTY 关闭前后仍可能有尾包到达;为它新建追踪器会把「已退出」播回
  // idle(红点翻灰),且新追踪器再也收不到 exit,直到用户关标签页。
  function trackerForPty(sessionId: SessionId): Tracker | null {
    const existing = trackers.get(sessionId)
    if (existing) {
      return existing
    }
    return ptyRegistry.activeSessionIds().includes(sessionId)
      ? create(sessionId, { seed: true })
      : null
  }

  // 标题/屏幕快照源:渲染层的上行可能晚于退出(快照节流的尾沿),只认有活动 PTY 的会话——
  // Why: 退出后到达的旧快照若新建追踪器,会把「已退出」重新覆盖成 working/idle,红点变回灰点。
  function trackerForUi(sessionId: SessionId): Tracker | null {
    const existing = trackers.get(sessionId)
    if (existing) {
      return existing
    }
    return ptyRegistry.activeSessionIds().includes(sessionId)
      ? create(sessionId, { seed: true })
      : null
  }

  ipcMain.handle(IPC_CHANNELS.stateTitle, (_event, p: StateTitleEvent): void => {
    trackerForUi(p.sessionId)?.onTitle(p.title)
  })

  ipcMain.handle(IPC_CHANNELS.stateSnapshot, (_event, p: StateSnapshotEvent): void => {
    trackerForUi(p.sessionId)?.onSnapshot(p.text)
  })

  // 字节源在主进程内直喂(不经桥):注册表已把同一批字节推给渲染层,这里只做状态判定
  ptyRegistry.onData(({ sessionId, data }) => {
    trackerForPty(sessionId)?.onBytes(data)
  })

  ptyRegistry.onExit(({ sessionId, exitCode }) => {
    // 退出路径自己去建:退出事件里 PTY 条目已先被摘(activeSessionIds 不再含它),但这里必须落地
    // exited——取不到就建,且 seed: false 不先播 idle
    const tracker = trackers.get(sessionId) ?? create(sessionId, { seed: false })
    tracker?.onExit(exitCode)
    // 追踪器只服务活着的 PTY:退出广播后即摘除条目(重开标签页时首个字节再建新的),
    // Why: 常驻会为每个退役会话留 64KB 环形缓冲;迟到上行已由 trackerForUi 的活动 PTY 判定挡住。
    trackers.delete(sessionId)
  })
}
