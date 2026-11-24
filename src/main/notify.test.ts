// 接缝 shouldNotify 模块行为测试(原 T11 四条 + hook-run-state T5 增补:working→idle 任务完成通知)
// 期望值来源:brief 第 5 节通知语义(后台会话 × waiting)+ 用户需求(working→idle = 任务完成,后台才提醒)+ 手算布尔矩阵。
// 纯函数,不碰 Electron:真实 Notification 的接线靠冒烟。
import { describe, expect, it } from 'vitest'
import { shouldNotify } from './notify'

describe('shouldNotify(通知判定矩阵)', () => {
  it('1. 后台会话 × waiting → waiting(brief 第 5 节)', () => {
    expect(shouldNotify({ previous: 'idle', state: 'waiting', focused: false })).toBe('waiting')
  })

  it('2. 聚焦会话 × waiting → null(用户正看着,不需要通知)', () => {
    expect(shouldNotify({ previous: 'idle', state: 'waiting', focused: true })).toBeNull()
  })

  it('3. 任意会话 × exited → null(约定:进程结束不打扰)', () => {
    expect(shouldNotify({ previous: 'working', state: 'exited', focused: false })).toBeNull()
  })

  it('4. 后台会话 × working → null(干活中不需要提醒)', () => {
    expect(shouldNotify({ previous: 'idle', state: 'working', focused: false })).toBeNull()
  })

  it('5. 后台会话 × working→idle → done(任务完成通知)', () => {
    expect(shouldNotify({ previous: 'working', state: 'idle', focused: false })).toBe('done')
  })

  it('6. 聚焦会话 × working→idle → null(用户正看着,完成不必打扰)', () => {
    expect(shouldNotify({ previous: 'working', state: 'idle', focused: true })).toBeNull()
  })

  it('7. waiting→idle → null(不是从 working 来,不算任务完成)', () => {
    expect(shouldNotify({ previous: 'waiting', state: 'idle', focused: false })).toBeNull()
  })

  it('8. seed(null→idle)→ null(追踪器刚建立不构成迁移)', () => {
    expect(shouldNotify({ previous: null, state: 'idle', focused: false })).toBeNull()
  })
})
