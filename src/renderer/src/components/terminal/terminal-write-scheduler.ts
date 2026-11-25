// 渲染层终端写入调度器(T4):每会话队列 + 双闸(帧预算 / 在途上限)+ 可见性过滤
// 规格:docs/plans/2026-11-25-terminal-backpressure/spec.md「数据结构」节
// 用途:渲染层唯一数据出口,洪峰限速 + 隐藏缓冲,防主线程饱和;pump 由 use-terminal 的 RAF 每帧驱动
import type { SessionId } from '../../../../shared/types'

export type WriteSchedulerOptions = {
  // 注入的投递口:接线层以 terminal.write(chunk, done) 实现,done 回调即背压释放点
  write: (sessionId: SessionId, chunk: string, done: () => void) => void
  // 单帧单会话喂入上限(brief 第 5 节:256KB)
  frameBudgetChars: number
  // 会话未消化量上限(brief 第 5 节:4MB),按未回调字节数计,到则停喂
  inflightLimitChars: number
  // 会话队列上限(brief 第 5 节:4MB),到则丢队首
  queueLimitChars: number
}

export type WriteScheduler = {
  // 入队,注册前后同一条路(未注册会话默认不可见,只入队不消费)
  enqueue: (sessionId: SessionId, data: string) => void
  setVisible: (sessionId: SessionId, visible: boolean) => void
  // 每帧一次,由 use-terminal 的 RAF 驱动
  pump: () => void
  // 关标签清理:队列与在途计数一并移除
  remove: (sessionId: SessionId) => void
}

type SessionQueue = {
  chunks: string[]
  queuedChars: number
  // 在途 = 已投递但 done 未回调的字符数(真背压:xterm 解析完该块才回调)
  inflightChars: number
  visible: boolean
}

export function createWriteScheduler(options: WriteSchedulerOptions): WriteScheduler {
  const sessions = new Map<SessionId, SessionQueue>()

  function queueOf(sessionId: SessionId): SessionQueue {
    let queue = sessions.get(sessionId)
    if (!queue) {
      queue = { chunks: [], queuedChars: 0, inflightChars: 0, visible: false }
      sessions.set(sessionId, queue)
    }
    return queue
  }

  function enqueue(sessionId: SessionId, data: string): void {
    if (data.length === 0) {
      return // 空块不入队:不产生零长度投递(与主进程合并器「空串不产生空投递」同口径)
    }
    const queue = queueOf(sessionId)
    queue.chunks.push(data)
    queue.queuedChars += data.length
    // 队列上限:超限丢队首、保队尾(最新画面;D6 同款「丢最旧保最新」口径);
    // 恰等于上限不丢。单块自身超上限时保留该块(chunks.length > 1 兜底):
    // 丢掉最新块等于丢当前画面,内存仍有界(上游合并块 ≤ 64KB)
    while (queue.queuedChars > options.queueLimitChars && queue.chunks.length > 1) {
      const dropped = queue.chunks.shift()!
      queue.queuedChars -= dropped.length
    }
  }

  function setVisible(sessionId: SessionId, visible: boolean): void {
    queueOf(sessionId).visible = visible
  }

  function pump(): void {
    for (const [sessionId, queue] of sessions) {
      if (!queue.visible) {
        continue // 隐藏只缓冲:跳过消费,入队照常(切回可见后渐进追平)
      }
      if (queue.inflightChars >= options.inflightLimitChars) {
        continue // 在途达上限:本帧跳过,回调到达自动恢复
      }
      let budget = options.frameBudgetChars
      while (queue.chunks.length > 0 && budget > 0 && queue.inflightChars < options.inflightLimitChars) {
        const chunk = queue.chunks[0]!
        if (chunk.length > budget) {
          // 块大于剩余预算:切前缀投递、余段留队首(超预算块若整块等待将永不投递)
          const head = chunk.slice(0, budget)
          queue.chunks[0] = chunk.slice(budget)
          queue.queuedChars -= head.length
          deliver(sessionId, head)
          break
        }
        queue.chunks.shift()
        queue.queuedChars -= chunk.length
        deliver(sessionId, chunk)
        budget -= chunk.length
      }
    }
  }

  function deliver(sessionId: SessionId, chunk: string): void {
    const queue = sessions.get(sessionId)
    if (!queue) {
      return
    }
    // 投递即入账:在途按每次投递计一次;done 回调只减一次(双调用防御,见 spec 高风险显式扫)
    queue.inflightChars += chunk.length
    let settled = false
    options.write(sessionId, chunk, () => {
      if (settled) {
        return
      }
      settled = true
      queue.inflightChars -= chunk.length
    })
  }

  return {
    enqueue,
    setVisible,
    pump,
    remove: (sessionId: SessionId): void => {
      sessions.delete(sessionId)
    }
  }
}
