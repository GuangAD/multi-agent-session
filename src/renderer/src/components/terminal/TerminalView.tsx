// 常驻终端视图:每会话一个 xterm 实例;tab 切换仅切可见性(display),不销毁
// 设置来源(T5):settings-slice 的 settings 与系统深浅;创建期取当时值,运行时更新由 App 层
// applyTerminalAppearanceToAll 统一应用——本组件不重建实例(重建即丢画面)。
import { useEffect, useRef } from 'react'
import { useAppStore } from '../../store/app-store'
import { activateTerminal, closeTerminal, openTerminal } from './use-terminal'
import { systemPrefersDark } from '../../theme'
import type { SessionId } from '../../../../shared/types'

export function TerminalView({
  sessionId,
  active,
  scrollback
}: {
  sessionId: SessionId
  active: boolean
  scrollback: number
}): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  // Why 挂载时命令式读一次 store 而不是订阅:settings 变化由 App 层
  // applyTerminalAppearanceToAll 统一应用(不重建实例),本组件无需因设置变化重渲染
  // 创建/销毁只随 tab 开关(sessionId 变化);scrollback 是创建期参数,变化时重建
  useEffect(() => {
    const container = containerRef.current
    if (!container) {
      return
    }
    openTerminal(
      sessionId,
      scrollback,
      useAppStore.getState().settings,
      systemPrefersDark(),
      container
    )
    return () => closeTerminal(sessionId)
  }, [sessionId, scrollback])

  // 激活切换:可见后 fit(隐藏期间无尺寸)+ 聚焦
  useEffect(() => {
    if (active) {
      activateTerminal(sessionId)
    }
  }, [sessionId, active])

  return (
    <div
      ref={containerRef}
      // 本元素即 openTerminal 的 open 目标:xterm-container 类挂 open 目标与 Orca 同构
      // (pane-dom-creation.ts:45-47 同名类、pane-lifecycle.ts:54 terminal.open(xtermContainer));
      // calc 宽高与 4px 边距在 assets/terminal.css(flex 尺寸类管弹性占位,视觉类全交 CSS)。
      // data-scrollbars='sleek' 供 scrollbar-sleek.css 的属性选择器命中(Orca 原名
      // data-orca-scrollbars 挂应用根,我们收窄到终端容器)。
      className="xterm-container min-h-0 flex-1 flex flex-col overflow-hidden"
      data-scrollbars="sleek"
      style={{ display: active ? 'flex' : 'none' }}
    />
  )
}
