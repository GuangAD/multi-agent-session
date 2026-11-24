// 接缝 runImport / dedupeKey 模块行为测试(契约「测试规格」T1 第 2–3 条 + 既有接缝改写延续)
// 期望值来源:brief 7.1(重复导入不重复)+ ADR-0005(删除不登记忽略项,再次导入即重新入库)+ 手算。
// T1 依赖反转:runImport 不再查 agentRegistry,扫描函数经入参注入——本文件直接注入桩扫描器,
// 不再 mock 注册表(注册表↔插件接线由 scan-wiring.test.ts 守卫);既有用例口径与期望值来源不变。
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ImportCandidate } from '../../../shared/agents'
import type { AppStore } from '../../../shared/types'
import { sessionRecords } from '../session-records'
import { DEFAULT_STORE } from '../store-persistence'
import { dedupeKey, runImport } from './index'

// 桩扫描器:runImport 只消费候选,真实扫描行为由插件包内 fixture 回放覆盖
const scan = vi.fn<(projectPath: string) => Promise<ImportCandidate[]>>(async () => [])

const PROJECT_PATH = 'D:\\work\\myapp'

function emptyStore(): AppStore {
  return {
    version: 1,
    projects: [{ id: 'p1', path: PROJECT_PATH, name: 'myapp' }],
    sessions: [],
    settings: { ...DEFAULT_STORE.settings }
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

// runImport 入参(注入本文件的桩扫描器);agentName 沿用旧口径作无标题候选的兜底
function importArgs(store: AppStore) {
  return {
    store,
    p: {
      projectId: 'p1' as const,
      agentId: 'claude',
      agentName: 'Claude Code',
      projectPath: PROJECT_PATH,
      scan
    }
  }
}

beforeEach(() => {
  scan.mockReset()
  scan.mockResolvedValue([])
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

describe('runImport 注入语义(T1)', () => {
  it('2. 注入扫描器返回 2 条候选(store 预置 1 条同 dedupeKey)→ imported=1, skipped=1', async () => {
    const store = emptyStore()
    // 预置:同 (agentId, externalSessionId) 的已存在记录,项目仍存活
    store.sessions.push({
      id: 'seed-1',
      projectId: 'p1',
      agentId: 'claude',
      title: '标题 ext-1',
      createdAt: '2026-11-19T00:00:00.000Z',
      origin: 'imported',
      externalSessionId: 'ext-1'
    })
    scan.mockResolvedValue([candidate('ext-1', PROJECT_PATH), candidate('ext-2', PROJECT_PATH)])

    const result = await runImport(store, importArgs(store).p)

    expect(result).toEqual({ imported: 1, skipped: 1 })
    expect(store.sessions.map((session) => session.externalSessionId)).toEqual(['ext-1', 'ext-2'])
  })

  it('3. 不注入 scan(agentId 任意)→ { imported: 0, skipped: 0 },不抛错', async () => {
    const store = emptyStore()
    const result = await runImport(store, {
      projectId: 'p1',
      agentId: 'whatever-agent',
      agentName: '任意',
      projectPath: PROJECT_PATH
    })
    expect(result).toEqual({ imported: 0, skipped: 0 })
    expect(store.sessions).toEqual([])
  })
})

describe('runImport(既有口径改写延续)', () => {
  it('4. 同 (agentId, externalSessionId) 二次导入 → 不产生第二条', async () => {
    const store = emptyStore()
    scan.mockResolvedValue([
      candidate('ext-1', PROJECT_PATH),
      // 构造反例:其他目录的会话不属于本项目,不入库也不计入 skipped
      candidate('ext-other', 'D:\\work\\elsewhere')
    ])

    const first = await runImport(store, importArgs(store).p)
    const second = await runImport(store, importArgs(store).p)

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
    scan.mockResolvedValue([candidate('ext-back', PROJECT_PATH)])

    const first = await runImport(store, importArgs(store).p)
    expect(first).toEqual({ imported: 1, skipped: 0 })

    // 模拟删除:记录从 store 里移除(sessions:remove 的领域侧效果),agent 存储不动
    store.sessions = []

    const second = await runImport(store, importArgs(store).p)
    expect(second, '删掉的会话再次导入应直接回来').toEqual({ imported: 1, skipped: 0 })
    expect(store.sessions.map((session) => session.externalSessionId)).toEqual(['ext-back'])
  })

  it('5b. 走真实的删除路径(sessionRecords.remove)后再次导入 → 仍然重新入库', async () => {
    // Why 与 5 分开:5 直接清空数组模拟删除,只钉住 runImport 侧的语义;
    // 这条把 sessionRecords.remove 与 runImport 串起来跑,堵住「只在删除路径偷偷登记忽略项」的实现。
    // 期望值来源:ADR-0005(删除不登记忽略项)+ brief 7.1(重复导入不重复)。
    const store = emptyStore()
    scan.mockResolvedValue([candidate('ext-cycle', PROJECT_PATH)])

    const first = await runImport(store, importArgs(store).p)
    expect(first).toEqual({ imported: 1, skipped: 0 })

    const created = store.sessions[0]
    const removeResult = sessionRecords.remove(store, created.id, [])
    expect(removeResult).toEqual({ closedTabs: [] })
    expect(store.sessions).toEqual([])

    const second = await runImport(store, importArgs(store).p)
    expect(second).toEqual({ imported: 1, skipped: 0 })
  })

  it('6. 孤儿记录(项目已删除)不拦截导入 → 重新入库挂当前项目', async () => {
    // 2026-11-21 缺陷回归:T8 冒烟期发现——用户删除项目重新添加后 projectId 变化,
    // 旧导入记录成孤儿(永不可见)却仍占 dedupeKey,拦截了同会话重新导入(本机实况:
    // 4 条本项目记录挂旧 id,再导入提示「跳过 6 条」而列表只有 2 条)。
    // 期望:去重只统计项目仍存在的记录,孤儿不再拦截。
    const store = emptyStore()
    store.sessions.push({
      id: 'orphan-1',
      projectId: 'gone-project', // projects 数组里只有 p1:此记录的项目已删除
      agentId: 'claude',
      title: '孤儿',
      createdAt: '2026-11-19T00:00:00.000Z',
      origin: 'imported',
      externalSessionId: 'ext-orphan'
    })
    scan.mockResolvedValue([candidate('ext-orphan', PROJECT_PATH)])

    const result = await runImport(store, importArgs(store).p)

    expect(result).toEqual({ imported: 1, skipped: 0 })
    const live = store.sessions.filter((session) => session.projectId === 'p1')
    expect(live).toHaveLength(1)
    expect(live[0]).toMatchObject({ externalSessionId: 'ext-orphan', projectId: 'p1' })
  })
})
