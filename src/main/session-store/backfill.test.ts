// 接缝 BackfillCoordinator / resumeArgv 模块行为测试(契约「测试规格」十条)
// 期望值来源:brief 第 5 节并发规则(资格)+ Orca agent-resume-argv.ts 原文(resume 参数,
// 外部参照 .reference/orca-1.4.265/src/shared/agent-launch/startup/agent-resume-argv.ts,
// 逐参数手抄;按 controller 裁决,期望 = Orca 原文数组去掉首元素命令名)。
// 轮询定时器用 fake timers 驱动;节流档位锚点 = Orca agent-completion-poll-cadence.ts
// POLL_TIER_INTERVAL_MS(750/2000/3000/15000),放弃时限 = controller 裁决 300_000ms。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { antigravityPlugin as antigravityAgent } from '../agents/plugins/antigravity/plugin'
import { claudePlugin as claudeAgent } from '../agents/plugins/claude/plugin'
import { codexPlugin as codexAgent } from '../agents/plugins/codex/plugin'
import { kimiPlugin as kimiAgent } from '../agents/plugins/kimi/plugin'
import { piPlugin as piAgent } from '../agents/plugins/pi/plugin'
import {
  BACKFILL_GIVE_UP_MS,
  BackfillCoordinator,
  filterFreshCandidates
} from './backfill'
import type { ImportCandidate } from '../../shared/agents'
import type { Session } from '../../shared/types'

// 手算骨架:资格判定只读 origin/agentId/projectId/id,其余字段取 spec 默认值
function makeSession(p: Partial<Session> & { id: string }): Session {
  return {
    projectId: 'proj-1',
    agentId: 'claude',
    title: '测试会话',
    createdAt: '2026-11-21T00:00:00.000Z',
    origin: 'created',
    ...p
  }
}

beforeEach(() => {
  vi.useFakeTimers()
  BackfillCoordinator.releaseAll() // 模块内表互不串场
})

afterEach(() => {
  BackfillCoordinator.releaseAll()
  vi.useRealTimers()
})

// —— 资格规则与轮询(brief 第 5 节并发规则)——

it('用例 1:单会话轮询,存储出现新文件 → 返回该 id 可回填;节流 750/2000/3000→15000 封顶,成功自动释放', async () => {
  // 期望值来源:Orca agent-completion-poll-cadence.ts 档位手算推演——首扫立即,
  // 之后 +750、+2000、+3000、+15000(封顶);扫描时刻相对 t0 = [0, 750, 2750, 5750, 20750]
  const t0 = Date.now()
  const times: number[] = []
  const candidate = {
    externalSessionId: 'ext-new-1',
    filePath: 'D:\\h\\.claude\\projects\\proj-1\\ext-new-1.jsonl',
    cwd: 'D:/proj-1'
  }
  const scan = vi.fn(async () => {
    times.push(Date.now() - t0)
    return times.length >= 5 ? [candidate] : [] // 第 5 次扫描起文件才出现
  })
  const session = makeSession({ id: 's-backfill' })
  expect(BackfillCoordinator.claim(session, [])).toBe(true)
  const pending = BackfillCoordinator.poll(session, scan)
  await vi.advanceTimersByTimeAsync(0) // 只排空微任务:首扫立即发生
  expect(times).toEqual([0])
  await vi.advanceTimersByTimeAsync(750)
  expect(times).toEqual([0, 750])
  await vi.advanceTimersByTimeAsync(2000)
  expect(times).toEqual([0, 750, 2750])
  await vi.advanceTimersByTimeAsync(3000)
  expect(times).toEqual([0, 750, 2750, 5750])
  await vi.advanceTimersByTimeAsync(15000)
  expect(times).toEqual([0, 750, 2750, 5750, 20750])
  await expect(pending).resolves.toBe('ext-new-1')
  // 成功后自动释放资格(契约伪代码),后开者可接棒
  expect(BackfillCoordinator.pollingSessions().map((item) => item.id)).toEqual([])
})

it('用例 2:同 agent+项目两会话均请求 claim → 仅先开者 true,后开者 false(brief 第 5 节)', () => {
  const first = makeSession({ id: 's-first' })
  const second = makeSession({ id: 's-second' }) // 同 claude + proj-1
  expect(BackfillCoordinator.claim(first, [])).toBe(true)
  expect(BackfillCoordinator.claim(second, [first])).toBe(false)
  expect(BackfillCoordinator.pollingSessions().map((item) => item.id)).toEqual(['s-first'])
  // 资格按「同一 agent + 项目目录」计:跨项目、跨 agent 不构成冲突(手算同键判定的反面)
  expect(BackfillCoordinator.claim(makeSession({ id: 's-other-proj', projectId: 'proj-2' }), [first])).toBe(true)
  expect(BackfillCoordinator.claim(makeSession({ id: 's-other-agent', agentId: 'codex' }), [first])).toBe(true)
})

it('用例 3:先开者 release 后,后开者 claim 变 true(接棒)', () => {
  const first = makeSession({ id: 's-first' })
  const second = makeSession({ id: 's-second' })
  expect(BackfillCoordinator.claim(first, [])).toBe(true)
  expect(BackfillCoordinator.claim(second, [first])).toBe(false)
  BackfillCoordinator.release(first.id)
  expect(BackfillCoordinator.claim(second, [])).toBe(true)
  expect(BackfillCoordinator.pollingSessions().map((item) => item.id)).toEqual(['s-second'])
})

it('用例 4:imported 会话请求 claim → false,永不参与(brief 第 5 节)', () => {
  const imported = makeSession({
    id: 's-imported',
    origin: 'imported',
    externalSessionId: 'ext-old-9'
  })
  expect(BackfillCoordinator.claim(imported, [])).toBe(false)
  // 不登记持有:pollingSessions 里没有它,资格不被 imported 占用
  expect(BackfillCoordinator.pollingSessions()).toEqual([])
})

it('用例 5:轮询无果 → 300_000ms 放弃返回 null,记录保持无 id,资格释放(brief 第 5 节)', async () => {
  // 放弃时限定值锚点:controller 裁决「总放弃时限 5 分钟(300_000ms,从 claim 起算)」
  expect(BACKFILL_GIVE_UP_MS).toBe(300_000)
  const scan = vi.fn(async () => [])
  const session = makeSession({ id: 's-giveup' })
  expect(BackfillCoordinator.claim(session, [])).toBe(true)
  let result: string | null | undefined
  const pending = BackfillCoordinator.poll(session, scan).then((value) => {
    result = value
    return value
  })
  await vi.advanceTimersByTimeAsync(BACKFILL_GIVE_UP_MS - 1) // 299_999ms:仍在轮询,未放弃
  expect(result).toBeUndefined()
  await vi.advanceTimersByTimeAsync(1) // 恰到 claim 起 300_000ms:到时放弃
  await expect(pending).resolves.toBeNull()
  // 记录保持无 id:poll 不写回(写回由编排层在拿到 id 时做),放弃后资格已释放
  expect(session.externalSessionId).toBeUndefined()
  expect(BackfillCoordinator.pollingSessions()).toEqual([])
})

// —— resumeArgv 参数矩阵(外部参照:Orca agent-resume-argv.ts 原文逐参数手抄,
//    controller 裁决:返回「参数部分」,Orca 原文数组去掉首元素命令名——命令本体由
//    spawn 链路 resolveCommandPath 解析,重复返回会注入两次)——

it('用例 6:claude ref{id} → ["--resume",id];无 id → null', () => {
  // Orca 原文 case 'claude' → ['claude', '--resume', id](可选 effort 本任务不做)
  expect(claudeAgent.sessions?.resumeArgv?.({ id: 'rc-9f2c-uuid' })).toEqual([
    '--resume',
    'rc-9f2c-uuid'
  ])
  expect(claudeAgent.sessions?.resumeArgv?.({})).toBeNull()
})

it('用例 7:codex ref{id} → ["resume",id];无 id → null', () => {
  // Orca 原文 case 'codex' → ['codex', 'resume', id](resume 子命令,非 --flag)
  expect(codexAgent.sessions?.resumeArgv?.({ id: 'cx-4242' })).toEqual(['resume', 'cx-4242'])
  expect(codexAgent.sessions?.resumeArgv?.({})).toBeNull()
})

it('用例 8:antigravity ref{id} → ["--conversation",id];无 id → null', () => {
  // Orca 原文 case 'antigravity' → ['agy', '--conversation', id](命令名 agy 即本应用 command)
  expect(antigravityAgent.sessions?.resumeArgv?.({ id: 'agy-conv-1' })).toEqual([
    '--conversation',
    'agy-conv-1'
  ])
  expect(antigravityAgent.sessions?.resumeArgv?.({})).toBeNull()
})

it('用例 9:pi ref{filePath} → ["--session",filePath];无 filePath → null(有 id 也不行)', () => {
  // Orca 原文 case 'pi' → transcriptPath 存在才 ['pi', '--session', transcriptPath],否则 null
  const filePath = 'D:\\h\\.pi\\agent\\sessions\\proj-1\\abc\\session.jsonl'
  expect(piAgent.sessions?.resumeArgv?.({ id: 'pi-1', filePath })).toEqual(['--session', filePath])
  // 无转录路径不可续接:pi 只认文件,id 不替代(Orca 同款守卫)
  expect(piAgent.sessions?.resumeArgv?.({ id: 'pi-1' })).toBeNull()
  expect(piAgent.sessions?.resumeArgv?.({})).toBeNull()
})

it('用例 10:kimi ref{id} → ["--session",id];无 id → null', () => {
  // Orca 原文 case 'kimi' → ['kimi', '--session', id]
  // Why: Kimi resumes by id with --session; sessions are work-dir-scoped (enforced by callers).
  expect(kimiAgent.sessions?.resumeArgv?.({ id: 'session_abc123' })).toEqual([
    '--session',
    'session_abc123'
  ])
  expect(kimiAgent.sessions?.resumeArgv?.({})).toBeNull()
})

// —— Fix-1 守卫:候选新鲜度护栏(评审 Important-1)——
// 期望值来源:controller 修法裁定语义(只保留「文件出现于 claim 之后」的候选;stat 失败本 tick
// 丢弃;保留者按 mtime 升序;边界 mtime 恰等于 claim 算老文件)。纯函数,直接同步断言,
// 与 fake timers 无关;编排层接线由 scan-wiring.test.ts 静态守卫。
describe('filterFreshCandidates(候选新鲜度护栏)', () => {
  const claimedAtMs = 1_000
  const makeCandidate = (id: string, filePath: string): ImportCandidate => ({
    externalSessionId: id,
    filePath,
    cwd: 'D:/proj-1'
  })

  it('老候选(mtime 早于 claim)被排除——从未导入的历史文件不得成为候选(评审 Important-1 场景)', () => {
    const result = filterFreshCandidates(
      [makeCandidate('old-1', 'D:\\h\\old.jsonl')],
      claimedAtMs,
      () => 999
    )
    expect(result).toEqual([])
  })

  it('新候选(mtime 晚于 claim)保留', () => {
    const result = filterFreshCandidates(
      [makeCandidate('new-1', 'D:\\h\\new.jsonl')],
      claimedAtMs,
      () => 1_001
    )
    expect(result.map((item) => item.externalSessionId)).toEqual(['new-1'])
  })

  it('stat 失败(null)的候选本 tick 丢弃——文件可能在写入中,下个 tick 再看,不因此结束轮询', () => {
    const result = filterFreshCandidates(
      [makeCandidate('mid-write', 'D:\\h\\mid.jsonl')],
      claimedAtMs,
      () => null
    )
    expect(result).toEqual([])
  })

  it('两个新候选按 mtime 升序排序(最早在前——先启动先建文件,取首个不再是盲猜)', () => {
    const result = filterFreshCandidates(
      [
        makeCandidate('later', 'D:\\h\\later.jsonl'),
        makeCandidate('earlier', 'D:\\h\\earlier.jsonl')
      ],
      claimedAtMs,
      (filePath) => (filePath.includes('later') ? 3_000 : 2_000)
    )
    expect(result.map((item) => item.externalSessionId)).toEqual(['earlier', 'later'])
  })

  it('边界:mtime 恰等于 claimedAtMs → 排除(<= 语义)', () => {
    const result = filterFreshCandidates(
      [makeCandidate('edge', 'D:\\h\\edge.jsonl')],
      claimedAtMs,
      () => claimedAtMs
    )
    expect(result).toEqual([])
  })
})
