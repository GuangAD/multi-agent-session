// 接缝 runImport / dedupeKey 模块行为测试(契约「测试规格」第 4–5 条)
// 期望值来源:brief 7.1(重复导入不重复)+ ADR-0005(删除不登记忽略项,再次导入即重新入库)与手算。
// 扫描器由 agentRegistry 提供,本文件把注册表打桩成「claude 定义 + 固定候选」——runImport 只消费候选,
// 真实扫描器由 claude/codex 两个接缝各自回放(fixture 在本目录 __fixtures__)。
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ImportCandidate } from '../../../shared/agents'
import type { AppStore } from '../../../shared/types'
import { sessionRecords } from '../session-records'
import { dedupeKey, runImport } from './index'

const mocks = vi.hoisted(() => ({
  scan: vi.fn<(projectPath: string) => Promise<ImportCandidate[]>>()
}))

vi.mock('../../agents/agent-registry', () => ({
  agentRegistry: {
    getById: (id: string) =>
      id === 'claude'
        ? {
            id: 'claude',
            name: 'Claude Code',
            command: 'claude',
            icon: 'C',
            state: {},
            sessions: { scan: mocks.scan }
          }
        : undefined
  }
}))

const PROJECT_PATH = 'D:\\work\\myapp'

function emptyStore(): AppStore {
  return {
    version: 1,
    projects: [{ id: 'p1', path: PROJECT_PATH, name: 'myapp' }],
    sessions: [],
    settings: { scrollbackRows: 10000, theme: 'system' }
  }
}

function candidate(
  externalSessionId: string,
  cwd: string,
  overrides: Partial<ImportCandidate> = {}
): ImportCandidate {
  return {
    externalSessionId,
    externalTitle: `标题 ${externalSessionId}`,
    filePath: `D:\\home\\.claude\\projects\\D--work-myapp\\${externalSessionId}.jsonl`,
    cwd,
    activityAt: '2026-11-19T09:00:30.000Z',
    ...overrides
  }
}

beforeEach(() => {
  mocks.scan.mockReset()
})

describe('dedupeKey', () => {
  it('同一 agent 同一外部 id → 同键;换 agent 或换 id → 不同键(手算)', () => {
    expect(dedupeKey({ agentId: 'claude', externalSessionId: 'ext-1' })).toBe(
      dedupeKey({ agentId: 'claude', externalSessionId: 'ext-1' })
    )
    expect(dedupeKey({ agentId: 'claude', externalSessionId: 'ext-1' })).not.toBe(
      dedupeKey({ agentId: 'codex', externalSessionId: 'ext-1' })
    )
    expect(dedupeKey({ agentId: 'claude', externalSessionId: 'ext-1' })).not.toBe(
      dedupeKey({ agentId: 'claude', externalSessionId: 'ext-2' })
    )
  })
})

describe('runImport', () => {
  it('4. 同 (agentId, externalSessionId) 二次导入 → 不产生第二条', async () => {
    const store = emptyStore()
    mocks.scan.mockResolvedValue([
      candidate('ext-1', PROJECT_PATH),
      // 构造反例:其他目录的会话不属于本项目,不入库也不计入 skipped
      candidate('ext-other', 'D:\\work\\elsewhere')
    ])

    const first = await runImport(store, {
      projectId: 'p1',
      agentId: 'claude',
      projectPath: PROJECT_PATH
    })
    const second = await runImport(store, {
      projectId: 'p1',
      agentId: 'claude',
      projectPath: PROJECT_PATH
    })

    expect(first).toEqual({ imported: 1, skipped: 0 })
    expect(second).toEqual({ imported: 0, skipped: 1 })
    expect(store.sessions).toHaveLength(1)
    // 入库记录的形态(手算:candidate 字段 → Session 字段)
    expect(store.sessions[0]).toMatchObject({
      projectId: 'p1',
      agentId: 'claude',
      origin: 'imported',
      title: '标题 ext-1',
      externalTitle: '标题 ext-1',
      externalSessionId: 'ext-1',
      externalFilePath: 'D:\\home\\.claude\\projects\\D--work-myapp\\ext-1.jsonl',
      activityAt: '2026-11-19T09:00:30.000Z'
    })
  })

  it('5. 删除该会话后再导入 → 重新入库(不登记忽略项)', async () => {
    // 2026-11-21 用户决策(重过门 1):删除只删应用记录,不写任何忽略清单,
    // 再次导入同一个 (agentId, externalSessionId) 应当重新入库。
    const store = emptyStore()
    mocks.scan.mockResolvedValue([candidate('ext-back', PROJECT_PATH)])

    const first = await runImport(store, {
      projectId: 'p1',
      agentId: 'claude',
      projectPath: PROJECT_PATH
    })
    expect(first).toEqual({ imported: 1, skipped: 0 })

    // 模拟删除:记录从 store 里移除(sessions:remove 的领域侧效果),agent 存储不动
    store.sessions = []

    const second = await runImport(store, {
      projectId: 'p1',
      agentId: 'claude',
      projectPath: PROJECT_PATH
    })
    expect(second, '删掉的会话再次导入应直接回来').toEqual({ imported: 1, skipped: 0 })
    expect(store.sessions.map((session) => session.externalSessionId)).toEqual(['ext-back'])
  })

  it('5b. 走真实的删除路径(sessionRecords.remove)后再次导入 → 仍然重新入库', async () => {
    // Why 与 5 分开:5 直接清空数组模拟删除,只钉住 runImport 侧的语义;
    // 这条把 sessionRecords.remove 与 runImport 串起来跑,堵住「只在删除路径偷偷登记忽略项」的实现。
    // 期望值来源:ADR-0005(删除不登记忽略项)+ brief 7.1(重复导入不重复)。
    const store = emptyStore()
    mocks.scan.mockResolvedValue([candidate('ext-cycle', PROJECT_PATH)])

    const first = await runImport(store, {
      projectId: 'p1',
      agentId: 'claude',
      projectPath: PROJECT_PATH
    })
    expect(first).toEqual({ imported: 1, skipped: 0 })

    const created = store.sessions[0]
    const removeResult = sessionRecords.remove(store, created.id, [])
    expect(removeResult).toEqual({ closedTabs: [] })
    expect(store.sessions).toEqual([])

    const second = await runImport(store, {
      projectId: 'p1',
      agentId: 'claude',
      projectPath: PROJECT_PATH
    })
    expect(second).toEqual({ imported: 1, skipped: 0 })
  })
})
