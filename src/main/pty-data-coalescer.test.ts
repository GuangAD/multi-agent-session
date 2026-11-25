// 接缝 createPtyDataCoalescer(模块行为)契约测试:spec T3 覆盖矩阵用例 1-8
// + 评审增补(2026-11-25):用例 9 恰等边界守卫、用例 3 陈旧定时器取证三步
// 期望值来源:spec「数据结构」节(窗口/阈值/清空语义)+ brief 第 5 节参数
// (16ms 窗口 / 64KB 阈值,先到先发)+ 逐条手算拼接结果;timer 用 vitest fake timers 驱动。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPtyDataCoalescer } from './pty-data-coalescer'

// brief 第 5 节参数:合并窗口 16ms,单会话缓冲上限 64KB(字符数)
const WINDOW_MS = 16
const MAX_CHARS = 64 * 1024

describe('pty-data-coalescer · createPtyDataCoalescer', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('用例 1:同会话 "a"+"b"+"c" 入缓冲,推进一个窗口 → flush 收到单条 "abc"(手算拼接)', () => {
    const flush = vi.fn()
    const coalescer = createPtyDataCoalescer({ windowMs: WINDOW_MS, maxChars: MAX_CHARS, flush })
    coalescer.push('s1', 'a')
    coalescer.push('s1', 'b')
    coalescer.push('s1', 'c')
    expect(flush).not.toHaveBeenCalled() // 窗口未到期,不发出
    vi.advanceTimersByTime(WINDOW_MS)
    expect(flush).toHaveBeenCalledTimes(1)
    expect(flush).toHaveBeenCalledWith('s1', 'abc')
    coalescer.destroy()
  })

  it('用例 2:单块长 64KB+1 → 立即 flush,不等窗口(brief 第 5 节参数,手算 65537 字符)', () => {
    const flush = vi.fn()
    const coalescer = createPtyDataCoalescer({ windowMs: WINDOW_MS, maxChars: MAX_CHARS, flush })
    coalescer.push('s1', 'x'.repeat(MAX_CHARS + 1))
    expect(flush).toHaveBeenCalledTimes(1) // 阈值到即提前清空,不等窗口
    expect(flush).toHaveBeenCalledWith('s1', 'x'.repeat(MAX_CHARS + 1))
    vi.advanceTimersByTime(WINDOW_MS)
    expect(flush).toHaveBeenCalledTimes(1) // 已清空且无定时器,不再二次发出
    coalescer.destroy()
  })

  it('用例 3:缓冲未到期调 flushSession("s1") → 立即收到缓冲;陈旧窗口到期点无重复发,续期后按新窗发出(手算 "ab"+"cd"="abcd")', () => {
    const flush = vi.fn()
    const coalescer = createPtyDataCoalescer({ windowMs: WINDOW_MS, maxChars: MAX_CHARS, flush })
    coalescer.push('s1', 'ab')
    coalescer.push('s1', 'cd')
    expect(flush).not.toHaveBeenCalled() // 窗口未到期
    coalescer.flushSession('s1')
    expect(flush).toHaveBeenCalledTimes(1) // 立即清空发出(exit 保序)
    expect(flush).toHaveBeenCalledWith('s1', 'abcd')
    // 陈旧定时器取证(评审增补):清空后 push 重开新窗,原陈旧到期点(t=16)不得重复发,
    // 新窗到期(t=21)恰好发一次且只携 'e' —— 钉死 flushSession 取消窗口定时器的语义
    vi.advanceTimersByTime(WINDOW_MS - 11) // t=5:未到原窗口
    coalescer.push('s1', 'e') // 续期:新窗到期点 t=21
    vi.advanceTimersByTime(WINDOW_MS - 5) // t=16 = 原陈旧定时器到期点
    expect(flush).toHaveBeenCalledTimes(1) // 陈旧定时器已随清空取消,不重复发
    vi.advanceTimersByTime(WINDOW_MS - 11) // t=21 = push('e') 后满一个窗口
    expect(flush).toHaveBeenCalledTimes(2) // 按新窗发出,非陈旧定时器残发
    expect(flush).toHaveBeenNthCalledWith(2, 's1', 'e')
    coalescer.destroy()
  })

  it('用例 4:s1 与 s2 交错各三块 → 两会话各一条,内容不串(手算 1a1b1c / 2a2b2c)', () => {
    const flush = vi.fn()
    const coalescer = createPtyDataCoalescer({ windowMs: WINDOW_MS, maxChars: MAX_CHARS, flush })
    coalescer.push('s1', '1a')
    coalescer.push('s2', '2a')
    coalescer.push('s1', '1b')
    coalescer.push('s2', '2b')
    coalescer.push('s1', '1c')
    coalescer.push('s2', '2c')
    expect(flush).not.toHaveBeenCalled() // 两窗口都未到期
    vi.advanceTimersByTime(WINDOW_MS)
    expect(flush).toHaveBeenCalledTimes(2) // 每会话一条
    expect(flush).toHaveBeenNthCalledWith(1, 's1', '1a1b1c')
    expect(flush).toHaveBeenNthCalledWith(2, 's2', '2a2b2c')
    coalescer.destroy()
  })

  it('用例 5:块间隔 windowMs-1 连续入 → 合并为一条,不逐块发出(spec:窗口按最后一块起算续期)', () => {
    const flush = vi.fn()
    const coalescer = createPtyDataCoalescer({ windowMs: WINDOW_MS, maxChars: MAX_CHARS, flush })
    coalescer.push('s1', 'a')
    vi.advanceTimersByTime(WINDOW_MS - 1) // t=15:未到期
    coalescer.push('s1', 'b') // 续期:计时归零重算
    vi.advanceTimersByTime(WINDOW_MS - 1) // t=30:若未续期首块窗口早已到期
    coalescer.push('s1', 'c') // 再续期
    expect(flush).not.toHaveBeenCalled() // 持续续期内不逐块发出
    vi.advanceTimersByTime(WINDOW_MS) // 最后一块后再满一个窗口
    expect(flush).toHaveBeenCalledTimes(1)
    expect(flush).toHaveBeenCalledWith('s1', 'abc')
    coalescer.destroy()
  })

  it('用例 6:destroy 后推进窗口 → flush 零调用(约定:清全部定时器,测试收尾无泄漏)', () => {
    const flush = vi.fn()
    const coalescer = createPtyDataCoalescer({ windowMs: WINDOW_MS, maxChars: MAX_CHARS, flush })
    coalescer.push('s1', 'a')
    coalescer.push('s2', 'b')
    coalescer.destroy()
    vi.advanceTimersByTime(WINDOW_MS * 100)
    expect(flush).not.toHaveBeenCalled()
  })

  it('用例 7:空串入缓冲 → 不产生 flush(spec 隐含高风险扫:不产生空投递)', () => {
    const flush = vi.fn()
    const coalescer = createPtyDataCoalescer({ windowMs: WINDOW_MS, maxChars: MAX_CHARS, flush })
    coalescer.push('s1', '')
    vi.advanceTimersByTime(WINDOW_MS * 100)
    expect(flush).not.toHaveBeenCalled()
    coalescer.destroy()
  })

  it('用例 8:push 同会话累计超阈 → 单次 flush 携带全部,不拆多条(brief 第 5 节参数;阈值缩到 10 便于手算)', () => {
    const flush = vi.fn()
    const coalescer = createPtyDataCoalescer({ windowMs: 1000, maxChars: 10, flush })
    coalescer.push('s1', '1234567') // 7 < 10:不提前
    expect(flush).not.toHaveBeenCalled()
    coalescer.push('s1', '89ab') // 7+4=11 ≥ 10:立即清空
    expect(flush).toHaveBeenCalledTimes(1) // 单次发出
    expect(flush).toHaveBeenCalledWith('s1', '123456789ab') // 携带全部,不拆多条
    vi.advanceTimersByTime(1000)
    expect(flush).toHaveBeenCalledTimes(1) // 清空已取消窗口,无二次发出
    coalescer.destroy()
  })

  it('用例 9(评审增补):单块恰好等于 maxChars → 立即 flush 单次整发(恰等边界守卫,钉死 >= 语义防改坏成 >)', () => {
    const flush = vi.fn()
    const coalescer = createPtyDataCoalescer({ windowMs: WINDOW_MS, maxChars: MAX_CHARS, flush })
    coalescer.push('s1', 'x'.repeat(MAX_CHARS)) // 恰好 65536 字符,不超
    expect(flush).toHaveBeenCalledTimes(1) // 到即提前清空(>= 而非 >)
    expect(flush).toHaveBeenCalledWith('s1', 'x'.repeat(MAX_CHARS)) // 单次整发
    vi.advanceTimersByTime(WINDOW_MS)
    expect(flush).toHaveBeenCalledTimes(1) // 清空已取消窗口,无二次发出
    coalescer.destroy()
  })
})
