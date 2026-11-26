// 接缝 sessionRecords 模块行为测试(契约「测试规格」五条)
// 期望值来源:手算字面量 + brief 第 5 节删除/重命名语义;直接操作内存 store,不经 IPC、不碰 fs。
import { afterEach, expect, it, vi } from 'vitest'
import { sessionRecords } from './session-records'
import { DEFAULT_STORE } from './store-persistence'
import type { AgentId, AppStore, Session } from '../../shared/types'

// 手算骨架:本接缝只动 sessions 段,其余段取 spec 默认值
function emptyStore(): AppStore {
  return {
    version: 1,
    projects: [],
    sessions: [],
    settings: { ...DEFAULT_STORE.settings }
  }
}

afterEach(() => {
  vi.useRealTimers()
})

it('create:入库一条 created 记录,id 全局唯一', () => {
  const store = emptyStore()

  const first = sessionRecords.create(store, { projectId: 'p1', agentId: 'claude' })
  const second = sessionRecords.create(store, { projectId: 'p1', agentId: 'claude' })

  expect(store.sessions).toHaveLength(2)
  expect(store.sessions[0]).toBe(first) // 记录直接进 store.sessions(同一引用,后续落盘写的就是它)
  expect(first).toMatchObject({ projectId: 'p1', agentId: 'claude', origin: 'created' })
  expect(typeof first.id).toBe('string')
  expect(first.id.length).toBeGreaterThan(0)
  expect(second.id).not.toBe(first.id)
  // createdAt 是 ISO 字符串(手算:toISOString 规范化后原样返回)
  expect(new Date(first.createdAt).toISOString()).toBe(first.createdAt)
})

it('rename:只改 title,agentId/origin 等其余字段不动', () => {
  const store = emptyStore()
  const created = sessionRecords.create(store, { projectId: 'p1', agentId: 'claude' })
  // 附加字段代表回填/导入落下的元数据(brief 第 5 节:重命名只改应用侧显示名)
  store.sessions[0] = {
    ...created,
    externalTitle: 'agent 侧原名',
    externalSessionId: 'ext-1',
    lastOpenedAt: '2026-11-21T00:00:00.000Z',
    activityAt: '2026-11-20T00:00:00.000Z'
  }
  const before = structuredClone(store.sessions[0])

  sessionRecords.rename(store, { id: before.id, title: '新名' })

  expect(store.sessions).toHaveLength(1)
  expect(store.sessions[0].title).toBe('新名')
  // 把 title 换回旧值后必须与改动前完全一致:其余字段一个都没动
  expect({ ...store.sessions[0], title: before.title }).toEqual(before)
})

it('remove:无活动标签页 → 记录移除,closedTabs 为空', () => {
  const store = emptyStore()
  const keep = sessionRecords.create(store, { projectId: 'p1', agentId: 'claude' })
  const target = sessionRecords.create(store, { projectId: 'p1', agentId: 'codex' })

  const result = sessionRecords.remove(store, target.id, [])

  expect(result).toEqual({ closedTabs: [] })
  expect(store.sessions.map((session) => session.id)).toEqual([keep.id])
  expect(sessionRecords.get(store, target.id)).toBeUndefined()
})

it('remove:有活动标签页 → closedTabs 返回该标签页 id,记录仍被移除', () => {
  const store = emptyStore()
  const target = sessionRecords.create(store, { projectId: 'p1', agentId: 'pi' })
  const other = sessionRecords.create(store, { projectId: 'p2', agentId: 'kimi' })

  // 活动标签页集合里还有一条无关会话:只返回被删记录自己的 id
  const result = sessionRecords.remove(store, target.id, [target.id, other.id])

  expect(result).toEqual({ closedTabs: [target.id] })
  expect(store.sessions.map((session) => session.id)).toEqual([other.id])
})

it('listByProject:只含该项目记录,创建时间倒序', () => {
  vi.useFakeTimers()
  const store = emptyStore()
  // 交替创建四条,时间戳逐条 +1 分钟(手算顺序:P1 → 00:02 在 00:00 前;P2 → 00:03 在 00:01 前)
  const agenda: Array<{ projectId: string; agentId: AgentId; at: string }> = [
    { projectId: 'P1', agentId: 'claude', at: '2026-11-21T00:00:00.000Z' },
    { projectId: 'P2', agentId: 'codex', at: '2026-11-21T00:01:00.000Z' },
    { projectId: 'P1', agentId: 'pi', at: '2026-11-21T00:02:00.000Z' },
    { projectId: 'P2', agentId: 'kimi', at: '2026-11-21T00:03:00.000Z' }
  ]
  const created: Session[] = []
  for (const step of agenda) {
    vi.setSystemTime(new Date(step.at))
    created.push(sessionRecords.create(store, { projectId: step.projectId, agentId: step.agentId }))
  }

  expect(sessionRecords.listByProject(store, 'P1').map((session) => session.id)).toEqual([
    created[2].id,
    created[0].id
  ])
  expect(sessionRecords.listByProject(store, 'P2').map((session) => session.id)).toEqual([
    created[3].id,
    created[1].id
  ])
  expect(sessionRecords.listByProject(store, 'P3')).toEqual([])
})

it('removeByProject:只移除目标项目的记录并返回其 id,其他项目不动', () => {
  // 2026-11-21 变更:删除项目连带删除其下会话记录(plan 开发记录 20:15 条相邻裁决),
  // 根治 T4 已知空白①「projects:remove 不清理该项目 sessions」的孤儿记录。
  const store = emptyStore()
  const p1a = sessionRecords.create(store, { projectId: 'p1', agentId: 'claude' })
  const p1b = sessionRecords.create(store, { projectId: 'p1', agentId: 'pi' })
  const p2 = sessionRecords.create(store, { projectId: 'p2', agentId: 'kimi' })

  const removed = sessionRecords.removeByProject(store, 'p1')

  expect(removed.sort()).toEqual([p1a.id, p1b.id].sort()) // 返回被移除的 id,供连带关闭标签页
  expect(store.sessions.map((session) => session.id)).toEqual([p2.id])
  expect(sessionRecords.removeByProject(store, 'gone')).toEqual([]) // 不存在的项目:空操作
})
