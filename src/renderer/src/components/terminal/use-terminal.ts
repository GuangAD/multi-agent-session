// xterm 生命周期容器:每会话一个常驻实例(Map),tab 切换仅切可见性,tab 关闭才 dispose
// (契约:容器持 Map;数据经 bridge 事件按 sessionId 分发直灌实例,不进 React state)
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { bridge } from '../../ipc/bridge'
import type { SessionId } from '../../../../shared/types'

interface TerminalEntry {
  terminal: Terminal
  fitAddon: FitAddon
}

const terminals = new Map<SessionId, TerminalEntry>()

// Why: spawn await 返回后子进程即可产出,而终端注册发生在 React 提交后的 effect 里,
// 期间到达的 pty:data(快启动 CLI 的 banner/首帧)不能直接丢——按 sessionId 暂存,
// openTerminal 注册时立即 flush(先到先存、注册即放);tab 关闭一并清理
const pendingData = new Map<SessionId, string>()

// 单一数据泵:pty:data 事件按 sessionId 分发直灌对应实例(挂一次,页面生命周期常驻)
let dataBusBound = false
function ensureDataBus(): void {
  if (dataBusBound) {
    return
  }
  dataBusBound = true
  bridge.pty.onPtyData(({ sessionId, data }) => {
    const entry = terminals.get(sessionId)
    if (entry) {
      entry.terminal.write(data)
    } else {
      // 未注册:先到先存,openTerminal 注册时立即 flush
      pendingData.set(sessionId, (pendingData.get(sessionId) ?? '') + data)
    }
  })
}

// 窗口尺寸变化 → 重排全部实例(隐藏实例无尺寸,FitAddon 自动跳过,不会提出 0 列 resize)
function fitAll(): void {
  for (const entry of terminals.values()) {
    entry.fitAddon.fit()
  }
}
let resizeBound = false
function ensureWindowResize(): void {
  if (resizeBound) {
    return
  }
  resizeBound = true
  window.addEventListener('resize', fitAll)
}

// tab 挂载时创建实例;重入(StrictMode 双挂载等)时已有实例则不动
export function openTerminal(
  sessionId: SessionId,
  scrollback: number,
  container: HTMLElement
): void {
  ensureDataBus()
  ensureWindowResize()
  if (terminals.has(sessionId)) {
    return
  }
  const terminal = new Terminal({ scrollback })
  const fitAddon = new FitAddon()
  terminal.loadAddon(fitAddon)
  terminal.open(container)
  // 键入 → PTY;fit 提出的尺寸变化 → pty:resize 回传
  terminal.onData((data) => {
    void bridge.pty.write({ sessionId, data })
  })
  terminal.onResize(({ cols, rows }) => {
    void bridge.pty.resize({ sessionId, cols, rows })
  })
  terminals.set(sessionId, { terminal, fitAddon })
  // 注册即放:注册前暂存的启动输出立即写入,先于此后到达的直灌数据
  const pending = pendingData.get(sessionId)
  if (pending !== undefined) {
    pendingData.delete(sessionId)
    terminal.write(pending)
  }
  // 首帧布局稳定后再 fit(容器刚挂载时尺寸未定)
  requestAnimationFrame(() => {
    terminals.get(sessionId)?.fitAddon.fit()
  })
}

// tab 关闭(组件卸载)才 dispose
export function closeTerminal(sessionId: SessionId): void {
  terminals.get(sessionId)?.terminal.dispose()
  terminals.delete(sessionId)
  pendingData.delete(sessionId) // 暂存随 tab 清理,防泄漏/串台到此后新开的终端
}

// tab 切换激活:display 由组件渲染控制;这里在可见后 fit(隐藏期间无尺寸)+ 聚焦
export function activateTerminal(sessionId: SessionId): void {
  const entry = terminals.get(sessionId)
  if (!entry) {
    return
  }
  requestAnimationFrame(() => {
    if (terminals.get(sessionId) !== entry) {
      return // 已被 dispose(快速开关 tab 的竞态)
    }
    entry.fitAddon.fit()
    entry.terminal.focus()
  })
}
