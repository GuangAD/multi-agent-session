// 主进程合并器:每会话一个缓冲串 + 单槽窗口定时器,把注册表的高频小块压成低频整块
// (spec「数据结构」节;brief 第 5 节:16ms 窗口或 64KB 阈值先到先发)。纯逻辑,
// 不依赖 Electron;定时器走全局 setTimeout,测试经 vitest fake timers 驱动。
import type { SessionId } from '../shared/types'

export type CoalescerOptions = {
  windowMs: number // 合并窗口,16
  maxChars: number // 单会话缓冲上限,64KB(字符数),到即提前清空
  flush: (sessionId: SessionId, text: string) => void // 清空出口,由接线层投递
}

export type PtyDataCoalescer = {
  push(sessionId: SessionId, data: string): void // 入缓冲,窗口起算或续期
  flushSession(sessionId: SessionId): void // 立即清空该会话(exit 保序用)
  destroy(): void // 清全部定时器,测试收尾用
}

// 每会话单槽:缓冲串 + 至多一个窗口定时器句柄
interface SessionBuffer {
  text: string
  timer: ReturnType<typeof setTimeout> | null
}

export function createPtyDataCoalescer(options: CoalescerOptions): PtyDataCoalescer {
  const buffers = new Map<SessionId, SessionBuffer>()

  // 立即清空该会话缓冲并发出(退出保序用);无缓冲时无动作。
  // 顺序:先取消窗口定时器与清空缓冲,再调 flush——回调内异常由接线层负责,缓冲已清空不会重发。
  const flushSession = (sessionId: SessionId): void => {
    const buffer = buffers.get(sessionId)
    if (!buffer || buffer.text.length === 0) {
      return // 无缓冲/空缓冲时无动作,不产生空投递
    }
    if (buffer.timer) {
      clearTimeout(buffer.timer)
      buffer.timer = null
    }
    const text = buffer.text
    buffers.delete(sessionId)
    options.flush(sessionId, text)
  }

  return {
    push(sessionId, data) {
      if (data.length === 0) {
        return // 空串:不缓冲、不起窗口,不产生空投递
      }
      let buffer = buffers.get(sessionId)
      if (!buffer) {
        buffer = { text: '', timer: null }
        buffers.set(sessionId, buffer)
      }
      buffer.text += data
      if (buffer.text.length >= options.maxChars) {
        flushSession(sessionId) // 阈值到即提前清空(含本块),单次发出,不等窗口
        return
      }
      // 窗口续期:每会话单槽,重复 push 只重置这一个定时器(spec:按最后一块起算,不叠加)
      if (buffer.timer) {
        clearTimeout(buffer.timer)
      }
      buffer.timer = setTimeout(() => {
        buffer.timer = null
        flushSession(sessionId)
      }, options.windowMs)
    },
    flushSession,
    destroy() {
      // 清全部定时器(测试收尾用);缓冲一并丢弃,destroy 后不再发出
      for (const buffer of buffers.values()) {
        if (buffer.timer) {
          clearTimeout(buffer.timer)
          buffer.timer = null
        }
      }
      buffers.clear()
    }
  }
}
