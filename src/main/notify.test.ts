// 接缝 shouldNotify 模块行为测试(契约「测试规格」四条)
// 期望值来源:brief 第 5 节通知语义(后台会话 × waiting 才通知)+ 手算布尔矩阵。
// 纯函数,不碰 Electron:真实 Notification 的接线靠冒烟。
import { describe, expect, it } from 'vitest'
import { shouldNotify } from './notify'

describe('shouldNotify(通知判定矩阵)', () => {
  it('1. 后台会话 × waiting → true(brief 第 5 节)', () => {
    expect(shouldNotify({ state: 'waiting', focused: false })).toBe(true)
  })

  it('2. 聚焦会话 × waiting → false(手算:用户正看着,不需要通知)', () => {
    expect(shouldNotify({ state: 'waiting', focused: true })).toBe(false)
  })

  it('3. 任意会话 × exited → false(约定:进程结束不打扰)', () => {
    expect(shouldNotify({ state: 'exited', focused: false })).toBe(false)
  })

  it('4. 后台会话 × working → false(手算:干活中不需要提醒)', () => {
    expect(shouldNotify({ state: 'working', focused: false })).toBe(false)
  })
})
