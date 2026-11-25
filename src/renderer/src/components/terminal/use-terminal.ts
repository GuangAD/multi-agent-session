// xterm 生命周期容器:每会话一个常驻实例(Map),tab 切换仅切可见性,tab 关闭才 dispose
// (契约:容器持 Map;数据经 bridge 事件入写入调度器统一队列,双闸调度喂入实例,不进 React state)
// + 滚轮处理(ADR-0004 修订 + T3.5 评审增量):经 xterm 官方钩子 attachCustomWheelEventHandler
//   挂单 handler 四分支(Shift 本地滚 / mouse mode 放大重放 / alt buffer 非 mouse 转翻页键 / xterm 默认)
// + 窗口跟随:每终端 ResizeObserver 观察容器 + RAF 稳定帧收敛
// + 后台 fit(T5):窗口稳定门收敛后,隐藏终端按「假如可见」的假想网格分帧重设并同步 PTY
import { Unicode11Addon } from '@xterm/addon-unicode11'
import { WebglAddon } from '@xterm/addon-webgl'
import { Terminal } from '@xterm/xterm'
// Fix-B 右侧空白治理:提案 = 盒子的纯函数(device/dpr cell 尺寸,与当前列数解耦),见 stable-cell-fit-addon.ts
import { StableCellFitAddon, readTerminalStableCellSize } from './stable-cell-fit-addon'
import { terminalGridSizeForBox } from './terminal-grid-size-for-box'
import { createWriteScheduler } from './terminal-write-scheduler'
import { activateRgiUnicodeProvider } from './terminal-unicode-provider'
import { resolveTerminalAppearance } from '../../../../shared/themes/resolve'
import { bridge } from '../../ipc/bridge'
import {
  createTerminalMouseWheelReplayState,
  replayTerminalMouseWheel,
  shouldReplayTerminalMouseWheel
} from './mouse-wheel-replay'
import type { SessionId, Settings } from '../../../../shared/types'

interface TerminalEntry {
  terminal: Terminal
  fitAddon: StableCellFitAddon
  // open 目标容器(TerminalView 渲染的 div):外观应用与首帧 fit 以 container.style.display 判定可见性
  container: HTMLElement
  // spawn 就绪回调是否已发:隐藏期跳过首帧 fit 时保持 false,由首次可见的 activateTerminal 补发
  readyFired: boolean
  // WebGL 降级标记(T6):context loss 置位;activateTerminal 按标记尝试重挂一次,
  // 重挂成功清位回 WebGL 渲染,失败保留继续用 DOM(失败终态,无退避/重试循环)
  webglLost?: boolean
  // 窗口跟随:容器观察者与稳定帧循环的待决 RAF id(closeTerminal 时显式撤销)
  fitResizeObserver: ResizeObserver | null
  pendingFitRafId: number | null
}

// Shift+滚轮本地滚动幅度:一格滚轮 3 行(常见终端惯例,可调)
const SHIFT_WHEEL_SCROLL_LINES = 3
// 字体度量与回退链的单一来源是 shared/themes(T3:fonts.ts 常量 + resolveTerminalAppearance),
// 本模块不再持有字体常量——canvas 测量与 DOM 渲染用的是同一份解析输出(T5)

// —— 窗口跟随:ResizeObserver + RAF 稳定帧收敛 ——
// Ported from stablyai/orca src/renderer/src/lib/pane-manager/terminal-fit/pane-fit-resize-observer.ts (MIT)
// Why: window resize→fitAll 挂钩测不到布局级容器变化(侧栏开合/面板拖拽),且高频拖拽下
// fit 直接收敛会振荡;改为每终端用自己的 ResizeObserver 观察容器,经 RAF 帧循环等「提出尺寸
// 稳定」再收敛。裁剪点:去掉 Orca 的 continuation registry/callbacks 泛化与可见性探测——
// 隐藏实例(display:none)不触发尺寸变化,但 fit() 不能就此跳过检查:本项目的 StableCellFitAddon
// 按盒子尺寸提案,0 尺寸盒经 terminal-grid-size-for-box 会落到 2×1 最小网格并被 fit 当作真实尺寸
// (xterm 原生 FitAddon 才会对隐藏容器返回 undefined)。故所有 fit 调用点都必须显式判 display。
type ProposedDimensions = {
  cols: number
  rows: number
}

// 收敛兜底帧数:Windows 拖拽滚动条等永不稳定的布局抖动,满 8 帧强制收敛,防 SIGWINCH 式振荡
const MAX_STABILITY_FRAMES = 8

function getProposedDimensions(entry: TerminalEntry): ProposedDimensions | null {
  try {
    return entry.fitAddon.proposeDimensions() ?? null
  } catch {
    return null
  }
}

function dimensionsEqual(a: ProposedDimensions | null, b: ProposedDimensions | null): boolean {
  return a?.cols === b?.cols && a?.rows === b?.rows
}

function terminalDimensionsEqual(entry: TerminalEntry, dims: ProposedDimensions): boolean {
  return entry.terminal.cols === dims.cols && entry.terminal.rows === dims.rows
}

function finishStableFit(entry: TerminalEntry): void {
  entry.pendingFitRafId = null
  entry.fitAddon.fit()
}

// 稳定帧循环:RAF 逐帧取 fit 提案,与 terminal 现值一致 / 连续两帧相同 / 满 8 帧 → fit 收敛退出
function requestStableFit(entry: TerminalEntry): void {
  if (entry.pendingFitRafId !== null) {
    return // 循环已在跑:ResizeObserver 高频触发合并进现有循环
  }
  let previous = getProposedDimensions(entry)
  let frameCount = 0
  const waitForStableGrid = (): void => {
    entry.pendingFitRafId = requestAnimationFrame(() => {
      entry.pendingFitRafId = null
      const next = getProposedDimensions(entry)
      frameCount += 1
      if (!next || terminalDimensionsEqual(entry, next) || dimensionsEqual(previous, next)) {
        finishStableFit(entry)
        return
      }
      previous = next
      if (frameCount >= MAX_STABILITY_FRAMES) {
        finishStableFit(entry)
        return
      }
      waitForStableGrid()
    })
  }
  waitForStableGrid()
}

function attachTerminalFitResizeObserver(entry: TerminalEntry, container: HTMLElement): void {
  if (typeof ResizeObserver === 'undefined') {
    return
  }
  const observer = new ResizeObserver(() => {
    requestStableFit(entry)
  })
  observer.observe(container)
  entry.fitResizeObserver = observer
}

function detachTerminalFitResizeObserver(entry: TerminalEntry): void {
  entry.fitResizeObserver?.disconnect()
  entry.fitResizeObserver = null
  if (entry.pendingFitRafId !== null) {
    cancelAnimationFrame(entry.pendingFitRafId)
    entry.pendingFitRafId = null
  }
}

const terminals = new Map<SessionId, TerminalEntry>()

// Fix-B:终端首个 fit 收敛后的回调(会话切片注册它,据此带真实 cols/rows 发起 spawn)。
// Why: 模块级单槽而非组件 prop——终端生命周期常驻于此模块,回调只需一个消费者(store 切片)。
let terminalReadyHandler: ((sessionId: SessionId, cols: number, rows: number) => void) | null = null

export function setTerminalReadyHandler(
  handler: ((sessionId: SessionId, cols: number, rows: number) => void) | null
): void {
  terminalReadyHandler = handler
}

// —— 渲染层写入调度器(T4):渲染层唯一数据出口,洪峰限速 + 隐藏缓冲 ——
// 既有 pendingData 暂存袋并入调度器队列:未注册会话默认不可见只入队(先到先存),
// openTerminal 注册转可见后按入队序消费(注册即放),注册前后同一条路
// 双闸参数(brief 第 5 节):每帧预算 256KB、在途上限 4MB、队列上限 4MB;单位 = 字符
// (与主进程合并器 maxChars 同口径:UTF-16 码元数;常规块 ≤64KB,超限单块由调度器保队尾兜底)
export const WRITE_FRAME_BUDGET_CHARS = 262_144
export const WRITE_INFLIGHT_LIMIT_CHARS = 4_194_304
export const WRITE_QUEUE_LIMIT_CHARS = 4_194_304

const writeScheduler = createWriteScheduler({
  write: (sessionId, chunk, done) => {
    const entry = terminals.get(sessionId)
    if (!entry) {
      // 不可达兜底(调度器只投递可见会话,可见必已注册):不计在途直接放行,防僵尸悬挂
      done()
      return
    }
    // 真背压:xterm 解析完该块才回调 done(未回调字节数超 4MB 即停喂);释放可能解锁续泵
    entry.terminal.write(chunk, () => {
      done()
      scheduleWritePump()
    })
  },
  frameBudgetChars: WRITE_FRAME_BUDGET_CHARS,
  inflightLimitChars: WRITE_INFLIGHT_LIMIT_CHARS,
  queueLimitChars: WRITE_QUEUE_LIMIT_CHARS
})

// 泵帧调度:有活才排帧。enqueue / 转可见 / 在途释放三类事件都可能解锁消费,各自排一帧;
// 帧内 pump 后无新事件即自然停帧——空闲零帧耗,持续输出时等价「常驻 RAF 每帧 pump」
let pumpFramePending = false
function scheduleWritePump(): void {
  if (pumpFramePending) {
    return
  }
  pumpFramePending = true
  requestAnimationFrame(() => {
    pumpFramePending = false
    writeScheduler.pump()
  })
}

// Why: 泵帧记账是模块级单例,测试环境直接清空 rAF 队列会让记账与队列脱节;
// 与 resetAppliedAppearanceCache 同款,供用例显式重置起点(模块级单例,用例间不隐式继承)
export function resetWritePumpLoop(): void {
  pumpFramePending = false
}

// 可见性落闸薄导出(T4 评审发现1):TerminalView 在 active 翻 false 的失活路径调用——
// 预览打开等不经 activateTerminal 的隐藏路径也及时停喂只缓冲;转可见可能解锁积压队列,排一帧泵
export function setTerminalVisible(sessionId: SessionId, visible: boolean): void {
  writeScheduler.setVisible(sessionId, visible)
  if (visible) {
    scheduleWritePump()
  }
}

// 单一数据泵:pty:data 事件入统一队列(挂一次,页面生命周期常驻)
let dataBusBound = false
function ensureDataBus(): void {
  if (dataBusBound) {
    return
  }
  dataBusBound = true
  bridge.pty.onPtyData(({ sessionId, data }) => {
    writeScheduler.enqueue(sessionId, data)
    scheduleWritePump()
  })
}

// WebGL 挂载与丢失检测接线(openTerminal 初挂与 T6 激活重挂共用同一条路)。
// Why 订阅 onContextLoss 并主动 dispose:addon 收到 webglcontextlost 只 preventDefault 并起
// 3 秒计时器,未恢复时仅 fire 本事件、**不会自 dispose**(读 addon 0.20.0-beta.329 源码);
// 而回退 DOM renderer 的动作在 dispose 回调里(setRenderer(_createRenderer()))。
// 不订阅则 GPU 上下文丢失(驱动重置/远程桌面切换/休眠唤醒)后终端停在失效渲染器上白屏不恢复。
// 丢失同时置 webglLost 降级标记(T6):下次 activateTerminal 按标记尝试重挂一次。
// 返回是否挂载成功:loadAddon 同步抛(无 WebGL2 / 驱动拒绝)= 保持 DOM renderer,返回 false。
function mountWebglAddon(sessionId: SessionId, terminal: Terminal): boolean {
  try {
    const webglAddon = new WebglAddon()
    webglAddon.onContextLoss(() => {
      webglAddon.dispose() // 内部 setRenderer(DOM):xterm 自动回退,画面重绘
      const entry = terminals.get(sessionId)
      if (entry) {
        entry.webglLost = true // 丢失标记(T6):下次激活尝试重挂
      }
    })
    terminal.loadAddon(webglAddon)
    return true
  } catch {
    // 无 WebGL2 / GPU 受限环境(远程桌面等):保持 DOM renderer
    return false
  }
}

// tab 挂载时创建实例;重入(StrictMode 双挂载等)时已有实例则不动
export function openTerminal(
  sessionId: SessionId,
  scrollback: number,
  settings: Settings,
  container: HTMLElement
): void {
  ensureDataBus()
  if (terminals.has(sessionId)) {
    return
  }
  // Orca 同款渲染选项(Ported from stablyai/orca src/renderer/src/lib/pane-manager/
  // pane-terminal-options.ts:9-10/:65-68,MIT;normalize 函数不移植,直接落常量)。
  // 选项名/形状已对本仓 @xterm/xterm 6.1.0-beta.336 typings 核对(IScrollbarOptions.width):
  // 细滚动条 7px(启用 xterm 概览标尺,代价约一列宽的沟槽——网格侧由 StableCellFitAddon
  // 经 terminal.options.scrollbar 同步预留该宽度);滚动灵敏度取 Orca DEFAULT_* 常量值;
  // scrollOnUserInput 与 xterm 默认一致,按 Orca 显式落定。
  // 外观全量来自 resolveTerminalAppearance(单一来源):字体链、度量、光标、配色一次解析,
  // 与 applyTerminalAppearanceToAll 的运行时更新用同一个函数,不存在第二处字体来源。
  const appearance = resolveTerminalAppearance(settings)
  const terminal = new Terminal({
    scrollback,
    fontFamily: appearance.fontFamily,
    fontSize: appearance.fontSize,
    fontWeight: appearance.fontWeight,
    fontWeightBold: appearance.fontWeightBold,
    lineHeight: appearance.lineHeight,
    cursorStyle: appearance.cursorStyle,
    cursorBlink: appearance.cursorBlink,
    theme: appearance.theme,
    scrollbar: { width: 7 },
    // unicode 是 proposed API(宽度表 provider 注册与 activeVersion 都在其下);
    // 不开这一项,loadAddon(Unicode11Addon) 会直接抛错
    allowProposedApi: true,
    scrollSensitivity: 1.15,
    fastScrollSensitivity: 5,
    scrollOnUserInput: true
  })
  const fitAddon = new StableCellFitAddon()
  terminal.loadAddon(fitAddon)
  terminal.open(container)
  // WebGL 渲染器(2026-11-23,对齐 Orca terminal-rendering/):DOM renderer 每格独立放字体
  // 字形,cell 宽非整数(实测 8.203px)时浏览器亚像素栅格化在格子边界抗锯齿,pi 输入框的连续
  // ─ 边框每格出一个暗点(用户实机 + dev 复现);Windows Terminal 与挂了本 addon 的 Orca 均无
  // 此现象——webgl renderer 对 box-drawing/block/powerline 走 CustomGlyphs 矢量自绘
  // (xtermjs#2409),不依赖字体字形。挂载与丢失检测接线收敛于 mountWebglAddon
  // (T6 激活重挂同一条路);getContext('webgl2') 失败在 loadAddon 内同步 throw,
  // 接住即留在 DOM renderer,行为不劣于现状。
  mountWebglAddon(sessionId, terminal)
  // 宽字符宽度表(2026-11-23,对齐 Orca):xterm 内置宽度表只有 Unicode 6,该表下 emoji
  // (U+2705 ✅ / U+274C ❌ 等)宽度算 1;而 agent CLI 按 Unicode 9+ 排版、emoji 算 2 格,
  // 于是含 emoji 的行少占一格、右边框整体左移一格,视觉上像框线断开(用户实机截图)。
  // 加载 Unicode11Addon 提供 '11' 基表后,再激活 RGI 序列对齐 provider:pi 按 RGI emoji 把
  // 「窄字符+VS16」(➡️ ↗️ 等)与 ZWJ 组合序列计 2 格,'11' 基表仍算 1 格,行内每差一格
  // 滚动条竖线左移一格;详见 terminal-unicode-provider.ts。失败只影响宽度表,不回退其他能力。
  try {
    terminal.loadAddon(new Unicode11Addon())
    activateRgiUnicodeProvider(terminal)
  } catch {
    // addon 不可用时保持内置 Unicode 6 表,行为不劣于现状(仅 emoji 行可能错位)
  }
  // 键入 → PTY;fit 提出的尺寸变化 → pty:resize 回传
  terminal.onData((data) => {
    void bridge.pty.write({ sessionId, data })
  })
  terminal.onResize(({ cols, rows }) => {
    void bridge.pty.resize({ sessionId, cols, rows })
  })
  // 滚轮四分支(T3.5 评审增量;单 handler:xterm 钩子单槽,后挂替换先挂)
  // 分支 1 Shift+滚轮本地滚动(ADR-0004,controller 定夺修订):挂 terminal 实例上
  // 随 dispose 自清,不在容器挂监听。handler 返回 false → xterm 取消该滚轮事件的全部默认处理
  // (CoreBrowserTerminal.ts:642/:810——不进 mouse 转发也不进 viewport 滚动);返回 true → 交
  // xterm 默认(有 mouse mode 时滚轮序列发应用,否则 xterm 滚 scrollback viewport)。
  // Shift+滚轮的本地滚在 alt buffer 下是 no-op 但仍返回 false 拦掉默认防误发(复审确认口径):
  // BufferService.scrollLines 把 ydisp 夹逼在 [0, ybase](xterm src/common/services/
  // BufferService.ts),alt buffer 无 scrollback(ybase = 视口),真正的交替屏滚动走分支 2.5
  // 翻页键。xterm typings:scrollLines 正值 = 向下滚(负值向上),与滚轮 deltaY 同向。
  // 分支 2 无 Shift + mouse mode(terminal.modes.mouseTrackingMode)→ 放大重放(Orca 移植,
  // 见 tui-wheel-reports.ts / mouse-wheel-replay.ts):按距离解析成 N 个 line-mode 克隆事件
  // 重放给 xterm,由其内建 mouse 路径逐条转报告发 TUI;重放克隆带标记再入时落分支 3,防放大递归。
  // 分支 2.5(评审期第五项修复):交替屏 + 非 mouse mode + deltaY≠0 → 滚轮转翻页键直达 PTY。
  // Why: Windows ConPTY 不透传鼠标模式序列(?1000/?1002/?1006 实测在转发中被吞),pi 运行在
  // 交替屏(?1049h)时 xterm 端 mouseTrackingMode 恒 none,滚轮报告永远发不出去——分支 3 的
  // 「交 xterm 默认」在此只会空滚视口,pi 无感。与生态方案同构(wmux#42「mouse off 时滚轮
  // 回退方向键」):滚轮转成应用已绑定的按键直达。pi 实测 PageUp/PageDown(\x1b[5~/\x1b[6~)
  // 经 ConPTY 正常可达,且绑定在滚自己的历史视图上(pi 源码 tui.altScreen.pageUp/pageDown);
  // 其方向键绑定在移动选择项上、方向语义有歧义,故取翻页键整页滚动:deltaY<0(向上滚)→
  // PageUp,deltaY>0 → PageDown,返回 false 拦掉 xterm 默认。显式查 mouseTrackingMode 为排除
  // 重放克隆:克隆只在 mouse mode 下产生,须落分支 3 防放大递归。
  // 分支 3 其余(deltaY=0 水平滚轮、重放克隆、非 mouse mode 的 normal buffer)→ 返回 true 交 xterm 默认。
  const wheelReplayState = createTerminalMouseWheelReplayState()
  terminal.attachCustomWheelEventHandler((event) => {
    if (event.shiftKey && event.deltaY !== 0) {
      terminal.scrollLines(Math.sign(event.deltaY) * SHIFT_WHEEL_SCROLL_LINES)
      return false
    }
    if (shouldReplayTerminalMouseWheel(terminal, event)) {
      replayTerminalMouseWheel(wheelReplayState, terminal, event)
      return false
    }
    if (
      terminal.modes.mouseTrackingMode === 'none' &&
      terminal.buffer.active.type === 'alternate' &&
      event.deltaY !== 0
    ) {
      void bridge.pty.write({ sessionId, data: event.deltaY < 0 ? '\x1b[5~' : '\x1b[6~' })
      return false
    }
    return true
  })
  // 复制/中断键位(2026-11-24,Windows Terminal 同款惯例):终端内 Ctrl+C 的本义是向前台进程发
  // 中断信号(SIGINT/0x03)——打断命令/agent 回答的核心能力,不能让位给复制;而 xterm 把终端内
  // 全部按键捕获后直送 PTY,浏览器复制机制收不到,故复制在此钩子内拦截。折中形态:有选区的
  // Ctrl+C = 复制并清选区(不发 0x03),无选区照发中断;显式 Ctrl+Shift+C = 复制(有选区才写)。
  // 粘贴无需接线:Ctrl+V/Shift+V 走浏览器原生 paste 事件(xterm CoreBrowserTerminal 已挂),直进 PTY。
  // handler 返回 false = 事件已消费、不再编码发往 PTY。与 App.tsx 全局快捷键不冲突(其对终端
  // 区域只放行 Ctrl+Tab)。剪贴板写入失败静默(权限/失焦),消费语义不变。
  terminal.attachCustomKeyEventHandler((event) => {
    if (event.type !== 'keydown' || !event.ctrlKey || event.altKey) {
      return true
    }
    if (event.key !== 'c' && event.key !== 'C') {
      return true
    }
    if (!event.shiftKey && !terminal.hasSelection()) {
      return true // 无选区的 Ctrl+C:放行 = 照发中断信号
    }
    const selection = terminal.getSelection()
    if (selection) {
      void navigator.clipboard.writeText(selection).catch(() => {})
      terminal.clearSelection()
    }
    return false
  })
  const entry: TerminalEntry = {
    terminal,
    fitAddon,
    container,
    fitResizeObserver: null,
    pendingFitRafId: null,
    readyFired: false
  }
  terminals.set(sessionId, entry)
  // 窗口跟随:observer 观察容器,尺寸变化(含窗口/侧栏/面板引发的)经稳定帧循环收敛 fit
  attachTerminalFitResizeObserver(entry, container)
  // 可见性接线(T4 隐藏只缓冲):出生即按容器实况落闸——display:none 的出生隐藏终端
  // 只入队不消费,首次 activateTerminal 转可见后渐进追平
  setTerminalVisible(sessionId, container.style.display !== 'none')
  // 首帧布局稳定后再 fit(容器刚挂载时尺寸未定);ResizeObserver 初次回调亦会触发收敛,此处兜底
  requestAnimationFrame(() => {
    const entry = terminals.get(sessionId)
    if (!entry) {
      return // 已在同一帧内被关闭
    }
    // 隐藏容器(display:none)不能 fit:盒子是 0 尺寸,自定义 addon 的提案会落到 2×1 最小网格,
    // fit 会把它当真实尺寸应用并经 onResize → pty.resize 打到后台 agent(T6 评审 P1-2:
    // 改回滚行数会重建隐藏标签,这条路因此可达)。不 fit 也不回调 ready——spawn 等
    // activateTerminal 的可见后 fit 再来(隐藏标签本就不该在这时拉进程)。
    if (entry.container.style.display === 'none') {
      return
    }
    entry.fitAddon.fit()
    // TUI(pi 等)启动即正确宽度(它收不到后续 resize 通知,见 sessions-slice 的 Why)
    entry.readyFired = true
    terminalReadyHandler?.(sessionId, entry.terminal.cols, entry.terminal.rows)
  })
}

// tab 关闭(组件卸载)才 dispose
export function closeTerminal(sessionId: SessionId): void {
  const entry = terminals.get(sessionId)
  if (entry) {
    detachTerminalFitResizeObserver(entry) // observer 与待决 fit 帧不随 dispose 自清,显式撤销
    entry.terminal.dispose() // 滚轮钩子随 dispose 自清,无需摘除
  }
  terminals.delete(sessionId)
  writeScheduler.remove(sessionId) // 队列与在途计数随 tab 清理,防泄漏/串台到此后新开的终端
}

// —— 设置接线(T5;T-R5 收成单一 settings 入参)→ 全部已开终端即时应用解析结果 ——
// 可重复调用、幂等(值来自纯函数解析输出);注册表为空时遍历空集,无副作用。
// 出错:单终端失败不阻断其余终端,console.error 记录该终端。
// 上次全量应用的解析指纹(D12):与本次解析完全一致即跳过重放——shell/回滚行数等无关
// settings 字段变更、以及「值未变的重复应用」(loadSettings 初载重拉)不再触碰任何终端;
// 外观真变时正常应用。reset 供测试定起点(模块级单例,用例间不得隐式继承缓存状态)。
let lastAppliedAppearance: string | null = null

export function resetAppliedAppearanceCache(): void {
  lastAppliedAppearance = null
}

export function applyTerminalAppearanceToAll(settings: Settings): void {
  const appearance = resolveTerminalAppearance(settings)
  const fingerprint = JSON.stringify(appearance)
  if (fingerprint === lastAppliedAppearance) {
    return
  }
  lastAppliedAppearance = fingerprint
  for (const [sessionId, entry] of terminals) {
    try {
      // xterm v6 无 applyOptions 方法,运行时更新唯一入口是 options setter(部分对象逐键合并,
      // 对象值按引用比较——theme 每次传解析新产物,槽未变时同引用天然 no-op)。scrollback 不在
      // 运行时应用:创建期参数,沿用「变化即重建实例」语义(TerminalView 既有 effect)。
      entry.terminal.options = {
        fontFamily: appearance.fontFamily,
        fontSize: appearance.fontSize,
        fontWeight: appearance.fontWeight,
        fontWeightBold: appearance.fontWeightBold,
        lineHeight: appearance.lineHeight,
        cursorStyle: appearance.cursorStyle,
        cursorBlink: appearance.cursorBlink,
        theme: appearance.theme
      }
      // 度量类变更 refit:走既有 RAF 稳定帧收敛循环(与 ResizeObserver 同一条 fit 路径);
      // fit 改变 cols/rows 由既有 onResize → pty.resize 链路同步 PTY 网格,此处不再接线。
      // 隐藏终端跳过 fit:display:none 容器的盒子是 0 尺寸,提案会落到 2×1 最小网格,fit
      // 会压扁网格;切回显示时 activateTerminal 的既有 RAF fit 补齐。
      if (entry.container.style.display !== 'none') {
        requestStableFit(entry)
      }
    } catch (error) {
      console.error(`终端外观应用失败(${sessionId}):`, error)
    }
  }
}

// tab 切换激活:display 由组件渲染控制;这里落可见性闸 + 在可见后 fit(隐藏期间无尺寸)+ 聚焦
export function activateTerminal(sessionId: SessionId): void {
  const entry = terminals.get(sessionId)
  if (!entry) {
    return
  }
  // 可见性接线(T4 隐藏只缓冲):激活者唯一可见,其余终端转隐藏只入队(切走即停消费);
  // 落闸经薄导出(避免双写),转可见侧由其排一帧泵
  for (const [id] of terminals) {
    setTerminalVisible(id, id === sessionId)
  }
  // WebGL 重挂(T6):丢失标记存在时本激活尝试重挂一次——成功清标记回 WebGL 渲染;
  // 抛错(无 WebGL2 / 驱动拒绝)吞掉,标记保留继续用 DOM,fit 与聚焦照常(下一帧)。
  // 每次激活至多尝试一次,无自动重试循环;重挂失败保持 DOM 是稳态
  if (entry.webglLost) {
    if (mountWebglAddon(sessionId, entry.terminal)) {
      entry.webglLost = false
    }
  }
  requestAnimationFrame(() => {
    if (terminals.get(sessionId) !== entry) {
      return // 已被 dispose(快速开关 tab 的竞态)
    }
    entry.fitAddon.fit()
    // 隐藏期被跳过 ready 的会话(创建时不可见),在首次可见时补发一次——此时 cols/rows 是真实尺寸
    if (!entry.readyFired) {
      entry.readyFired = true
      terminalReadyHandler?.(sessionId, entry.terminal.cols, entry.terminal.rows)
    }
    entry.terminal.focus()
  })
}

// —— 后台 fit(T5):窗口稳定后按「假如可见」的网格分帧重设隐藏终端 ——
// 规格:docs/plans/2026-11-25-terminal-backpressure spec T5 / brief 第 5 节
// Why: 隐藏终端(display:none)无盒,其 ResizeObserver 不触发,窗口拉宽后后台网格与 PTY
// 网格持续过时,要等切回时 activateTerminal 补 fit 才纠正——shell 场景即宽度跳变。
// 零尺寸陷阱(brief 失败形态):对隐藏容器实测必得 0 盒,提案落到 2×1 最小网格并被打到
// 后台 agent——故格子像素与盒子都取可见终端作参照,对每个隐藏终端走既有
// terminalGridSizeForBox 换算「假如可见」的目标网格,全程不经隐藏容器测量。
type HiddenFitReference = {
  // 参照格子像素:可见终端的 device/dpr 读数(stable-cell-fit-addon 同源)
  cell: { width: number; height: number }
  // 参照盒:.xterm 的 parentElement(xterm-container)计算宽高——隐藏终端假如可见即占同一
  // 槽位(常驻实例仅 display 互斥,T7),与 StableCellFitAddon.proposeDimensions 同一测量点
  box: { width: number; height: number }
}

// 参照读取:遍历注册表取首个度量齐备的可见终端(常态至多一个可见;多可见为防御并存)
function readHiddenFitReference(): HiddenFitReference | null {
  for (const entry of terminals.values()) {
    if (entry.container.style.display === 'none') {
      continue
    }
    const cell = readTerminalStableCellSize(entry.terminal)
    const parent = entry.terminal.element?.parentElement
    const view = entry.terminal.element?.ownerDocument.defaultView
    if (!cell || !parent || !view) {
      continue // 度量未就绪(初始化中):换下一个可见者
    }
    const style = view.getComputedStyle(parent)
    const box = {
      width: Number.parseInt(style.getPropertyValue('width'), 10) || 0,
      height: Number.parseInt(style.getPropertyValue('height'), 10) || 0
    }
    if (box.width <= 0 || box.height <= 0) {
      continue // 0 盒(布局未就绪):不提案,防最小网格打到 agent
    }
    return { cell, box }
  }
  return null
}

// 隐藏终端自身的盒内边距:getComputedStyle 对 display:none 元素仍返回 px 计算值
// (.xterm 无 padding 声明,初始值即 0;非百分比不依赖布局),读法与可见路径一致
function readTerminalElementPadding(terminal: Terminal): {
  top: number
  right: number
  bottom: number
  left: number
} {
  const element = terminal.element
  const view = element?.ownerDocument.defaultView
  if (!element || !view) {
    return { top: 0, right: 0, bottom: 0, left: 0 }
  }
  const style = view.getComputedStyle(element)
  const read = (prop: string): number => Number.parseInt(style.getPropertyValue(prop), 10) || 0
  return {
    top: read('padding-top'),
    right: read('padding-right'),
    bottom: read('padding-bottom'),
    left: read('padding-left')
  }
}

// 轮次记账:上一轮未排空时忽略新触发(可重入安全,稳定信号一轮足够);
// Why 模块级单例 + reset 导出:测试环境直接清空 rAF 队列会让记账脱节(与 resetWritePumpLoop 同款)
let hiddenFitRoundPending = false
let hiddenFitRafId: number | null = null

export function resetHiddenFitLoop(): void {
  if (hiddenFitRafId !== null) {
    cancelAnimationFrame(hiddenFitRafId)
    hiddenFitRafId = null
  }
  hiddenFitRoundPending = false
}

// 对全部隐藏终端按假想网格分帧重设;网格变化经既有 onResize → pty:resize 链路同步 PTY
// (真实 xterm 对同尺寸 resize 是 no-op,不变网格不产生 pty:resize——CoreBrowserTerminal.resize 早退)
export function fitHiddenTerminals(): void {
  if (hiddenFitRoundPending) {
    return // 上一轮未排空:忽略新触发,等当前轮把队列消化完
  }
  const reference = readHiddenFitReference()
  if (!reference) {
    return // 无可见参照(全隐藏 / 度量未就绪):整轮静默跳过,等下一轮窗口稳定
  }
  const targets = Array.from(terminals.entries()).filter(
    ([, entry]) => entry.container.style.display === 'none'
  )
  if (targets.length === 0) {
    return
  }
  hiddenFitRoundPending = true
  // 分帧:每帧至多处理一个终端,RAF 排空(T5 处理 4)——避免一帧内全量重排卡帧
  let index = 0
  const step = (): void => {
    hiddenFitRafId = requestAnimationFrame(() => {
      hiddenFitRafId = null
      const target = targets[index]
      index += 1
      // 目标仍在注册表且未重建才动手(快速关标签/重建实例的竞态);重设失败单点吞掉不影响其余
      if (target && terminals.get(target[0]) === target[1]) {
        try {
          const grid = terminalGridSizeForBox(reference.box, {
            cell: reference.cell,
            padding: readTerminalElementPadding(target[1].terminal),
            scrollback: target[1].terminal.options.scrollback,
            scrollbar: target[1].terminal.options.scrollbar
          })
          target[1].terminal.resize(grid.cols, grid.rows)
        } catch {
          // 终端已销毁等单点失败:吞掉继续(T5 失败与退出)
        }
      }
      if (index < targets.length) {
        step()
      } else {
        hiddenFitRoundPending = false
      }
    })
  }
  step()
}
