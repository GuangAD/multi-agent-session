// 常驻终端视图:每会话一个 xterm 实例;tab 切换仅切可见性(display),不销毁
import { useEffect, useRef } from 'react'
import { activateTerminal, closeTerminal, openTerminal } from './use-terminal'
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

  // 创建/销毁只随 tab 开关(sessionId 变化);scrollback 是创建期参数,变化时重建
  useEffect(() => {
    const container = containerRef.current
    if (!container) {
      return
    }
    openTerminal(sessionId, scrollback, container)
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
      className="min-h-0 flex-1 overflow-hidden p-1"
      style={{ display: active ? 'block' : 'none' }}
    />
  )
}
