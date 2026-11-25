// 渲染层写入调度器函数级测试(T4):每会话队列 × 双闸(帧预算 / 在途上限)× 可见性 × 上限与清理
// write 注入假实现:记录投递、done 手动控制(模拟 xterm 未解析完),期望值全部手算字符数
// 覆盖矩阵:docs/plans/2026-11-25-terminal-backpressure/spec.md「覆盖标准 · T4 调度器」
import { describe, expect, it } from 'vitest'
import { createWriteScheduler } from './terminal-write-scheduler'
import type { SessionId } from '../../../../shared/types'

// 假投递记录:一次 write 调用 = 一条记录,done 由测试手动触发(不调 = 在途悬挂)
type RecordedDelivery = {
  sessionId: SessionId
  chunk: string
  done: () => void
}

// 小参数档(手算友好):预算 10 / 在途 20 / 队列 1000,按用例需要覆写单档
function makeScheduler(
  overrides: Partial<{
    frameBudgetChars: number
    inflightLimitChars: number
    queueLimitChars: number
  }> = {}
): {
  scheduler: ReturnType<typeof createWriteScheduler>
  deliveries: RecordedDelivery[]
  fedChunks: (sessionId: SessionId) => string[]
  fedChars: (sessionId: SessionId) => number
} {
  const deliveries: RecordedDelivery[] = []
  const scheduler = createWriteScheduler({
    write: (sessionId, chunk, done) => {
      deliveries.push({ sessionId, chunk, done })
    },
    frameBudgetChars: 10,
    inflightLimitChars: 20,
    queueLimitChars: 1000,
    ...overrides
  })
  const fedChunks = (sessionId: SessionId): string[] =>
    deliveries.filter((delivery) => delivery.sessionId === sessionId).map((delivery) => delivery.chunk)
  const fedChars = (sessionId: SessionId): number =>
    fedChunks(sessionId).reduce((sum, chunk) => sum + chunk.length, 0)
  return { scheduler, deliveries, fedChunks, fedChars }
}

describe('terminal-write-scheduler 双闸调度(T4)', () => {
  it('T4 用例1 预算闸:入队 3×预算量,pump 一次只喂入 1×预算,余量留队列后续帧消费', () => {
    const { scheduler, deliveries, fedChunks, fedChars } = makeScheduler()
    const id = 's-budget'
    scheduler.setVisible(id, true)
    // 三块各 10 字符 = 预算 10 的 3 倍量,共 30 字符
    scheduler.enqueue(id, '0123456789')
    scheduler.enqueue(id, 'abcdefghij')
    scheduler.enqueue(id, 'klmnopqrst')

    scheduler.pump()
    // 期望值来源(手算):预算 10 → 本帧恰喂入第一块 10 字符 ≤ 1×预算
    expect(fedChars(id)).toBe(10)
    expect(fedChunks(id)).toEqual(['0123456789'])

    // 余量留队列:每帧释放已完成块的 done(对齐真实 xterm 解析完回调),逐帧按入队序
    // 消费剩余两块,每帧仍各恰 1×预算,总量不丢
    deliveries[0]!.done()
    scheduler.pump()
    expect(fedChars(id)).toBe(20)
    deliveries[1]!.done()
    scheduler.pump()
    expect(fedChars(id)).toBe(30)
    expect(fedChunks(id)).toEqual(['0123456789', 'abcdefghij', 'klmnopqrst'])
    deliveries[2]!.done()
  })
})

describe('terminal-write-scheduler 在途闸(T4 用例2)', () => {
  it('喂入后不调 done,在途达上限再 pump 零新喂入;done 释放在途后恢复喂入', () => {
    // 手算:预算 10(每帧 1 块)、在途上限 20(恰 2 块未回调)、共入队 4 块
    const { scheduler, deliveries, fedChars } = makeScheduler()
    const id = 's-inflight'
    scheduler.setVisible(id, true)
    scheduler.enqueue(id, 'aaaaaaaaaa')
    scheduler.enqueue(id, 'bbbbbbbbbb')
    scheduler.enqueue(id, 'cccccccccc')
    scheduler.enqueue(id, 'dddddddddd')

    scheduler.pump()
    scheduler.pump()
    expect(fedChars(id), '两帧各喂 1 块,在途 20 达上限').toBe(20)

    scheduler.pump()
    expect(fedChars(id), '在途达上限:零新喂入').toBe(20)

    deliveries[0]!.done() // 释放第一块 → 在途 10
    scheduler.pump()
    expect(fedChars(id), '回调到达自动恢复:恢复喂 1 块').toBe(30)
    deliveries[1]!.done()
    deliveries[2]!.done()
    scheduler.pump()
    expect(fedChars(id), '逐个调 done 后队尾块完整喂出').toBe(40)
    deliveries[3]!.done()
  })
})

describe('terminal-write-scheduler 隐藏只缓冲(T4 用例3)', () => {
  it('隐藏会话入队 + pump 零喂入;setVisible(true) + pump 后消费;未标记可见(从未 setVisible)也不消费', () => {
    const { scheduler, deliveries, fedChars } = makeScheduler()
    const id = 's-hidden'

    // 约定来源(spec T4 覆盖标准「隐藏不消费」;默认不可见 = 未注册会话先到先存的实现根基)
    scheduler.setVisible(id, false)
    scheduler.enqueue(id, 'xxxxx')
    scheduler.enqueue(id, 'yyyyy')
    scheduler.pump()
    expect(fedChars(id), '隐藏会话:零喂入').toBe(0)
    expect(deliveries.length, '隐藏会话:零投递').toBe(0)

    // 转可见后下一帧消费,入队序保持
    scheduler.setVisible(id, true)
    scheduler.pump()
    expect(deliveries.map((delivery) => delivery.chunk)).toEqual(['xxxxx', 'yyyyy'])

    // 未注册路径:从未 setVisible 的会话同样只入队(注册前先到先存的调度器侧语义)
    const silent = makeScheduler()
    silent.scheduler.enqueue('s-never', 'zzzzz')
    silent.scheduler.pump()
    expect(silent.fedChars('s-never'), '未标记可见:零喂入').toBe(0)
  })
})

describe('terminal-write-scheduler 队列上限(T4 用例4,brief 第 5 节参数语义)', () => {
  it('队列累计超 queueLimit:队首被丢、队尾完整,留存总量收敛到上限内', () => {
    // 手算:queueLimit 30,五块各 10 = 50 → 丢最旧两块,留存 C/D/E 恰 30
    const { scheduler, deliveries, fedChunks } = makeScheduler({ queueLimitChars: 30 })
    const id = 's-drop'
    scheduler.setVisible(id, true)
    scheduler.enqueue(id, 'AAAAAAAAAA')
    scheduler.enqueue(id, 'BBBBBBBBBB')
    scheduler.enqueue(id, 'CCCCCCCCCC')
    scheduler.enqueue(id, 'DDDDDDDDDD')
    scheduler.enqueue(id, 'EEEEEEEEEE')

    scheduler.pump()
    deliveries[0]!.done() // 释放已完成块,隔离出本用例关注的队列上限闸
    scheduler.pump()
    deliveries[1]!.done()
    scheduler.pump()
    // 队首(A、B)被丢;队尾完整(E 整块 10 字符,不被截断);总量 = queueLimit
    expect(deliveries.length, '丢弃后仅剩上限内三块').toBe(3)
    expect(fedChunks(id)).toEqual(['CCCCCCCCCC', 'DDDDDDDDDD', 'EEEEEEEEEE'])
    expect(fedChunks(id).join(''), '不含被丢队首').not.toContain('A')
    expect(fedChunks(id).join('')).not.toContain('B')
  })

  it('队列恰等于 queueLimit 的边界:不丢弃,总量完整(spec 高风险显式扫)', () => {
    // 手算:恰 30 = queueLimit → 不触发丢弃,三块全留
    const { scheduler, deliveries, fedChunks, fedChars } = makeScheduler({ queueLimitChars: 30 })
    const id = 's-boundary'
    scheduler.setVisible(id, true)
    scheduler.enqueue(id, 'AAAAAAAAAA')
    scheduler.enqueue(id, 'BBBBBBBBBB')
    scheduler.enqueue(id, 'CCCCCCCCCC')
    scheduler.pump()
    deliveries[0]!.done()
    scheduler.pump()
    deliveries[1]!.done()
    scheduler.pump()
    expect(fedChars(id)).toBe(30)
    expect(fedChunks(id)).toEqual(['AAAAAAAAAA', 'BBBBBBBBBB', 'CCCCCCCCCC'])
    deliveries[2]!.done()
  })
})

describe('terminal-write-scheduler 多会话并行(T4 用例5)', () => {
  it('A 在途达上限停喂,B 正常喂入:A 停喂不影响 B', () => {
    const { scheduler, deliveries, fedChars } = makeScheduler()
    const a = 's-multi-a'
    const b = 's-multi-b'
    scheduler.setVisible(a, true)
    scheduler.setVisible(b, true)
    // A:三块入队,前两帧喂出 2 块 → 在途 20 达上限
    scheduler.enqueue(a, 'AAAAAAAAAA')
    scheduler.enqueue(a, 'AAAAAAAAAA')
    scheduler.enqueue(a, 'AAAAAAAAAA')
    scheduler.pump()
    scheduler.pump()
    expect(fedChars(a), 'A 在途 20 达上限').toBe(20)
    // B:正常会话,1 块待喂
    scheduler.enqueue(b, 'BBBBBBBBBB')

    scheduler.pump()
    expect(fedChars(a), 'A 在途超限:零新喂入').toBe(20)
    expect(deliveries.filter((delivery) => delivery.sessionId === b).map((delivery) => delivery.chunk)).toEqual(
      ['BBBBBBBBBB']
    )

    // A 回调释放后恢复,B 不受影响地继续
    deliveries[0]!.done()
    scheduler.enqueue(b, 'BBBBBBBBBB')
    scheduler.pump()
    expect(fedChars(a), 'A 恢复喂入').toBe(30)
    expect(fedChars(b), 'B 继续正常喂入').toBe(20)
  })
})

describe('terminal-write-scheduler 关标签清理(T4 用例7)', () => {
  it('remove 后 pump 该会话零喂入;残留队列与在途一并清理,迟到 done 与 remove 后再入队均不复活消费', () => {
    const { scheduler, deliveries, fedChars } = makeScheduler()
    const id = 's-remove'
    scheduler.setVisible(id, true)
    scheduler.enqueue(id, 'aaaaaaaaaa')
    scheduler.enqueue(id, 'bbbbbbbbbb')
    scheduler.pump()
    expect(fedChars(id)).toBe(10)

    scheduler.remove(id) // 关标签:队列(剩 1 块)与在途计数一并清理
    scheduler.pump()
    expect(fedChars(id), 'remove 后:零喂入(残留队列不再消费)').toBe(10)
    expect(deliveries.length).toBe(1)

    // 迟到 done(remove 前已投递块的回调):不崩、不影响其他会话
    expect(() => deliveries[0]!.done()).not.toThrow()

    // remove 后再入队(pty:data 晚于关标签到达):入队不消费,该会话永不再喂
    scheduler.enqueue(id, 'cccccccccc')
    scheduler.pump()
    expect(fedChars(id), 'remove 后再入队:零喂入').toBe(10)
    expect(deliveries.length).toBe(1)
  })
})

describe('terminal-write-scheduler 高风险显式扫(spec:回调异常路径与边界)', () => {
  it('done 双调用:在途只按每次投递减一次,不会超减提前解锁', () => {
    // 手算:预算 20(一帧可喂 2 块)、在途上限 20。双调用若超减到 0,下帧会喂出 2 块(40);
    // 只减一次则在途 10,下帧恰喂 1 块(30)——差额即可观测的变异点
    const { scheduler, deliveries, fedChars } = makeScheduler({ frameBudgetChars: 20 })
    const id = 's-double-done'
    scheduler.setVisible(id, true)
    scheduler.enqueue(id, 'aaaaaaaaaa')
    scheduler.enqueue(id, 'bbbbbbbbbb')
    scheduler.enqueue(id, 'cccccccccc')
    scheduler.enqueue(id, 'dddddddddd')
    scheduler.pump()
    scheduler.pump()
    expect(fedChars(id)).toBe(20)

    deliveries[0]!.done()
    deliveries[0]!.done() // 异常路径:双调用
    scheduler.pump()
    expect(fedChars(id), '双调用只减一次:恰恢复 1 块而非 2 块').toBe(30)
  })

  it('空字符串入队:不产生零长度投递', () => {
    const { scheduler, deliveries } = makeScheduler()
    const id = 's-empty'
    scheduler.setVisible(id, true)
    scheduler.enqueue(id, '')
    scheduler.enqueue(id, '')
    scheduler.pump()
    expect(deliveries, '空块不投递').toEqual([])
  })

  it('单块超帧预算:按预算切前缀逐帧投递,内容与顺序完整不丢', () => {
    // 手算:预算 10,单块 24 字符 → 10 + 10 + 4 三帧投完(每帧释放 done,隔离在途闸)
    const { scheduler, deliveries, fedChunks, fedChars } = makeScheduler()
    const id = 's-split'
    scheduler.setVisible(id, true)
    scheduler.enqueue(id, '0123456789ABCDEFGHIJJKLM')

    scheduler.pump()
    expect(fedChars(id), '首帧恰 1×预算').toBe(10)
    deliveries[0]!.done()
    scheduler.pump()
    expect(fedChars(id)).toBe(20)
    deliveries[1]!.done()
    scheduler.pump()
    expect(fedChars(id), '余段 4 字符收尾').toBe(24)
    expect(fedChunks(id).join(''), '内容与顺序完整').toBe('0123456789ABCDEFGHIJJKLM')
    deliveries[2]!.done()
  })
})
