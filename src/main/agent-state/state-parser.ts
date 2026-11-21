// 三源状态引擎(spec 模块划分:main/agent-state/state-parser.ts;接缝 = createTracker)
// 输入:标题(xterm onTitleChange 经 IPC 上行)、屏幕快照(渲染层节流序列化的视口文本)、
// 字节环形缓冲(跨 chunk 拼接后子串匹配)、退出事件。判定顺序即证据分级(本任务口径 5):
//   exited(终态)> waiting 地标 > working 信号 > 标题规则 > 静默超时 idle
// 规则数据全在 AgentDefinition.state(五家定义见 agents/definitions),引擎不认识具体 agent——
// 新增 agent 仍是「新增一个定义文件,框架零改动」。
// 「working 信号」的读法与 Orca 的 requiresQuiet 同构:画面地标证明画面已绘制,输出在流动时读
// working,静止达门槛后同一个地标表示就绪画面(Orca codex/antigravity json 的就绪规则都带
// requiresQuiet,见 .reference/orca-1.4.265/src/main/runtime/agent-state-rules/)。
import type { AgentDefinition, AgentStateRules } from '../../shared/agents'
import type { SessionRunState } from '../../shared/types'

// 字节环形缓冲上限:只留最近 64KB(plan 附录 A4「内存有界」,PTY 转发不积压)
export const BYTE_BUFFER_LIMIT = 64 * 1024
// 状态去抖窗口:同态在此窗口内不重复广播;窗口内又被反证掉的变化不落地(spec「状态变更去抖」)
export const STATE_DEBOUNCE_MS = 300
// 定义的 idleQuietMs 缺省(五家定义均显式给 2000,此处只是兜底)
export const DEFAULT_QUIET_MS = 2000

export interface TrackerOptions {
  // 时钟注入(测试用假时钟;缺省 Date.now —— 安静门槛的定时器与它必须同一时间轴)
  now?: () => number
  // 安静门槛覆盖(缺省取 def.state.idleQuietMs,再缺省 2000)
  quietMs?: number
}

export interface Tracker {
  onTitle(title: string): void
  onSnapshot(visibleText: string): void
  onBytes(chunk: string): void
  onExit(code: number): void
  state(): SessionRunState
  onChange(cb: (state: SessionRunState) => void): void
}

// 地标匹配:子串、大小写不敏感。Why: 屏幕文本的地标来自 agent 自己画的界面,品牌行/提示行大小写
// 随版本变化(Codex 的 `OpenAI Codex` 对 Orca 规则里的小写 `openai codex`),大小写敏感会在升级后
// 静默失配;Orca 的规则匹配同样对屏幕文本做归一化处理。
function matchesLandmark(landmarks: string[] | undefined, haystack: string): boolean {
  if (!landmarks || landmarks.length === 0 || haystack === '') {
    return false
  }
  const lowercased = haystack.toLowerCase()
  return landmarks.some((landmark) => lowercased.includes(landmark.toLowerCase()))
}

export function createTracker(def: AgentDefinition, opts: TrackerOptions = {}): Tracker {
  const rules: AgentStateRules = def.state
  const now = opts.now ?? Date.now
  const quietMs = opts.quietMs ?? rules.idleQuietMs ?? DEFAULT_QUIET_MS

  let state: SessionRunState = 'idle'
  // 终态标记:置位后一切输入(含迟到的上行)忽略
  let exited = false
  // 最近一次证据时刻;null = 尚无任何输出(等价于已安静:刚开终端即 idle)
  let lastActivityAt: number | null = null
  let lastTitle = ''
  let lastSnapshot = ''
  let byteBuffer = ''
  let quietTimer: ReturnType<typeof setTimeout> | null = null
  let commitTimer: ReturnType<typeof setTimeout> | null = null
  let pendingState: SessionRunState | null = null
  const listeners: Array<(state: SessionRunState) => void> = []

  function isQuiet(): boolean {
    return lastActivityAt === null || now() - lastActivityAt >= quietMs
  }

  function matchesTitle(patterns: RegExp[] | undefined): boolean {
    if (!patterns || patterns.length === 0 || lastTitle === '') {
      return false
    }
    return patterns.some((pattern) => pattern.test(lastTitle))
  }

  // 判定链(证据分级):仅供内部与安静定时器调用
  function evaluate(): SessionRunState {
    if (exited) {
      return 'exited'
    }
    const quiet = isQuiet()
    if (rules.degraded === true) {
      // 降级档(brief 第 5 节 kimi 预案):只认「有输出 = working、静默达门槛 = idle」,
      // 不参与地标/标题判定;waiting 并入相邻态
      return quiet ? 'idle' : 'working'
    }
    if (
      matchesLandmark(rules.screen?.waiting, lastSnapshot) ||
      matchesLandmark(rules.bytes?.waiting, byteBuffer)
    ) {
      // 菜单/对话框在屏 = 等用户输入:持有键盘,安静多久都还是 waiting(不等安静)
      return 'waiting'
    }
    if (
      !quiet &&
      (matchesLandmark(rules.screen?.working, lastSnapshot) ||
        matchesLandmark(rules.bytes?.working, byteBuffer))
    ) {
      return 'working'
    }
    if (matchesTitle(rules.title?.working)) {
      // 标题是 agent 自己写的状态(shell auto-title 只写裸名),不受安静门槛影响
      return 'working'
    }
    if (matchesTitle(rules.title?.idle)) {
      return 'idle'
    }
    if (quiet) {
      return 'idle'
    }
    // 无地标/标题证据且输出仍在流动:维持原判。Why: 裸标题(shell auto-title 从启动起就写)
    // 在整个回合里都不变,只有安静下来才能据它判 idle(Orca 各家规则 why 的 #6011 纪律)。
    return state
  }

  // 落地并广播:只有状态真的变化才通知监听器(「只广播变化」的单一出处,去抖的 commit 与事实型
  // 终态 onExit 共用)
  function publish(next: SessionRunState): void {
    if (next === state) {
      return
    }
    state = next
    for (const listener of listeners) {
      listener(state)
    }
  }

  function commit(): void {
    commitTimer = null
    const target = pendingState
    pendingState = null
    if (target === null) {
      return
    }
    publish(target)
  }

  // 状态变更去抖:目标稳定 STATE_DEBOUNCE_MS 才落地(短促来回抖动不产生任何广播);
  // 目标回到当前态即撤销待决变更。
  function requestState(next: SessionRunState): void {
    if (next === state) {
      if (commitTimer !== null) {
        clearTimeout(commitTimer)
        commitTimer = null
      }
      pendingState = null
      return
    }
    if (next === pendingState) {
      return // 已排同一目标:不延长窗口(持续同一判定不该把落地无限推后)
    }
    pendingState = next
    if (commitTimer !== null) {
      clearTimeout(commitTimer)
    }
    commitTimer = setTimeout(commit, STATE_DEBOUNCE_MS)
  }

  // 安静门槛定时器:每次证据重置;到点再走一遍判定链——标题仍报 working 时保持 working
  // (标题优先于静默超时),否则落 idle
  function armQuietTimer(): void {
    if (quietTimer !== null) {
      clearTimeout(quietTimer)
    }
    quietTimer = setTimeout(() => {
      quietTimer = null
      requestState(evaluate())
    }, quietMs)
  }

  function markActivity(): void {
    lastActivityAt = now()
    armQuietTimer()
  }

  function clearTimers(): void {
    if (quietTimer !== null) {
      clearTimeout(quietTimer)
      quietTimer = null
    }
    if (commitTimer !== null) {
      clearTimeout(commitTimer)
      commitTimer = null
    }
    pendingState = null
  }

  return {
    onTitle(title: string): void {
      if (exited) {
        return
      }
      lastTitle = title
      markActivity()
      requestState(evaluate())
    },

    onSnapshot(visibleText: string): void {
      if (exited) {
        return
      }
      lastSnapshot = visibleText
      // 快照到达即宣告更早的字节证据过期:byteBuffer 是「会话开始以来最近 64KB」的只增日志,没有
      // 「上次快照之后」的语义。Why: 屏幕快照是比字节流更强、更新的证据;waiting 分支又在判定链最前
      // 且不设安静闸门,某条 waiting 地标字节流过一次后会永久短路(用户已点掉菜单、画面干净了仍报
      // waiting,直到 64KB 新字节把它挤出去)。清空后跨 chunk 拼接在两次快照之间照旧成立,流式地标仍可靠。
      byteBuffer = ''
      markActivity()
      requestState(evaluate())
    },

    onBytes(chunk: string): void {
      if (exited) {
        return
      }
      // 跨 chunk 拼接:地标可能被一次 read 切成两段,匹配必须打在拼接后的尾巴上
      byteBuffer = (byteBuffer + chunk).slice(-BYTE_BUFFER_LIMIT)
      markActivity()
      requestState(evaluate())
    },

    // 退出码不参与判定(exited 是终态,不按码细分);参数由调用方照契约传入
    onExit(): void {
      if (exited) {
        return
      }
      exited = true
      clearTimers()
      // 退出是事实不是判定,不进去抖窗口,立即落地并广播。Why: 去抖是为吸收 working/waiting 的短促抖动,
      // exited 不会抖;经 requestState 要走 300ms 才落地,而 ipc/state 在 onExit 之后立刻摘掉追踪器,
      // 这 300ms 内迟到的 pty:data 尾包会新建追踪器播回 idle(红点翻灰)。clearTimers 保留:待决的
      // working/waiting 变化必须作废。
      publish('exited')
    },

    state: (): SessionRunState => state,

    onChange(cb: (state: SessionRunState) => void): void {
      listeners.push(cb)
    }
  }
}
