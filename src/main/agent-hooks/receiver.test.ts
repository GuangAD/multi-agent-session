// 接缝 resolveHookTarget 模块行为测试(契约 T2「测试规格」表 1-4 行)
// 期望值来源:spec 覆盖标准 3「路由串台三反例」(token 不匹配 / 会话无 PTY / 字段缺失)
import { describe, expect, it } from 'vitest'
import { resolveHookTarget } from './receiver'

const BASE = {
  token: 'tok',
  expectedToken: 'tok',
  sessionId: 's-1',
  agent: 'claude',
  event: 'Stop',
  activeSessionIds: ['s-1']
}

describe('resolveHookTarget', () => {
  it('1. token 匹配 + 会话有活动 PTY → 返回 sessionId', () => {
    expect(resolveHookTarget(BASE)).toBe('s-1')
  })

  it('2. token 不匹配 → null(伪造/陈旧令牌拒绝)', () => {
    expect(resolveHookTarget({ ...BASE, token: 'wrong' })).toBeNull()
    expect(resolveHookTarget({ ...BASE, token: undefined })).toBeNull()
  })

  it('3. sessionId 不在活跃表(PTY 已退)→ null(不得复活死会话 tracker)', () => {
    expect(resolveHookTarget({ ...BASE, activeSessionIds: [] })).toBeNull()
    expect(resolveHookTarget({ ...BASE, sessionId: 's-other' })).toBeNull()
  })

  it('4. agent/event 缺失 → null(坏请求容错)', () => {
    expect(resolveHookTarget({ ...BASE, agent: undefined })).toBeNull()
    expect(resolveHookTarget({ ...BASE, event: undefined })).toBeNull()
    expect(resolveHookTarget({ ...BASE, sessionId: undefined })).toBeNull()
  })
})
