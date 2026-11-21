// 侧栏会话列表的展示顺序与折叠阈值(T6 接线步骤:列表按 activityAt 倒序,超一屏折叠)
// 期望值来源:plan M4「列表按最近活动排序,超出一屏折叠显示更多」与手算。
import { describe, expect, it } from 'vitest'
import { orderSessionsForDisplay } from './session-order'
import type { Session } from '../../shared/types'

function session(id: string, createdAt: string, activityAt?: string): Session {
  return {
    id,
    projectId: 'p1',
    agentId: 'claude',
    title: id,
    createdAt,
    origin: activityAt ? 'imported' : 'created',
    ...(activityAt ? { activityAt } : {})
  }
}

describe('orderSessionsForDisplay', () => {
  it('导入会话按 activityAt 倒序排在最近活动最前的顺序', () => {
    const ordered = orderSessionsForDisplay([
      session('old', '2026-11-01T00:00:00.000Z', '2026-11-10T00:00:00.000Z'),
      session('new', '2026-11-02T00:00:00.000Z', '2026-11-19T00:00:00.000Z'),
      session('mid', '2026-11-03T00:00:00.000Z', '2026-11-15T00:00:00.000Z')
    ])
    expect(ordered.map((item) => item.id)).toEqual(['new', 'mid', 'old'])
  })

  it('没有 activityAt 的自建会话退回 createdAt 参与排序', () => {
    const ordered = orderSessionsForDisplay([
      session('imported', '2026-11-01T00:00:00.000Z', '2026-11-05T00:00:00.000Z'),
      // 手算:自建会话没有 activityAt → 用 createdAt 2026-11-08,晚于导入会话的 11-05
      session('created', '2026-11-08T00:00:00.000Z')
    ])
    expect(ordered.map((item) => item.id)).toEqual(['created', 'imported'])
  })

  it('不改入参数组(纯函数:调用方持有的 store 切片不被就地重排)', () => {
    const input = [
      session('a', '2026-11-01T00:00:00.000Z'),
      session('b', '2026-11-02T00:00:00.000Z')
    ]
    const ordered = orderSessionsForDisplay(input)
    expect(input.map((item) => item.id)).toEqual(['a', 'b'])
    expect(ordered.map((item) => item.id)).toEqual(['b', 'a'])
  })
})
