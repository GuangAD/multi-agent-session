// 接缝 scanCodex 模块行为测试(契约「测试规格」第 11–15 条)
// 期望值来源:
//   · 第 11 条:__fixtures__/codex-rollout-{a,c}-0.162.1.jsonl 的实际内容(移植自 Orca 的真实 rollout)
//   · 第 12/13/14/15 条:构造反例(同会话两处存储、.zst 双形态、非会话文件、空目录)
// "两个存储位置" = 同一条 rollout 出现在两个日期子目录(本任务 codex 只读 <home>/.codex/sessions 一个根;
// 同根内重复形态对应 Orca codex-session-root-dedup 的 bridging/backfill 同一 rollout 多份):
// 去重必须只留一条。
import { afterEach, describe, expect, it } from 'vitest'
import { mkdir, mkdtemp, readFile, rm, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { zstdCompressSync } from 'node:zlib'
import { scanCodex } from './scan'

// Why:fixture 与本测试文件同目录,用 import.meta.dirname 定位,不读 process.cwd()(vitest 根一变即断,评审 Minor-B)。
const FIXTURE_DIR = join(import.meta.dirname, '__fixtures__')
const FIXTURE_A = 'codex-rollout-a-0.162.1.jsonl'
const FIXTURE_C = 'codex-rollout-c-0.162.1.jsonl'
// rollout 文件名 = rollout-<本地时间戳>-<thread id>(Orca codex-rollout-thread-id 规则)
const ROLLOUT_NAME_A = 'rollout-2026-11-06T12-39-00-01a1b0de-979d-7e80-a311-68be4ad607c3.jsonl'
const ROLLOUT_NAME_C = 'rollout-2026-11-06T12-31-26-01a1b0d7-abd0-79c3-980f-fc2e27480098.jsonl'

// 手算自 fixture 实际内容(见 第 11 条注释)
const C_ID = '01a1b0d7-abd0-79c3-980f-fc2e27480098'
const C_CWD =
  '/Users/example/orca/workspaces/orca/qa-codex-exec-import-qg/codex-exec-import/run/workspace'
const C_TITLE =
  'Importer QA C. Use the actual apply_patch tool once, not a shell patch command, to add codex-...'
const C_ACTIVITY_AT = '2026-11-06T12:31:38.787Z'
const A_ID = '01a1b0de-979d-7e80-a311-68be4ad607c3'
const A_TITLE =
  'Importer QA A. These are harmless local samples, with a public fake token, not credentials. U...'
const A_ACTIVITY_AT = '2026-11-06T12:39:21.577Z'

const homes: string[] = []

async function makeHome(): Promise<string> {
  const home = await mkdtemp(join(tmpdir(), 'scan-codex-'))
  homes.push(home)
  await mkdir(join(home, '.codex', 'sessions'), { recursive: true })
  return home
}

async function putRollout(
  home: string,
  dateSegments: string[],
  fileName: string,
  content: Buffer | string
): Promise<string> {
  const dir = join(home, '.codex', 'sessions', ...dateSegments)
  await mkdir(dir, { recursive: true })
  const filePath = join(dir, fileName)
  await writeFile(filePath, content)
  return filePath
}

function readFixture(name: string): Promise<string> {
  return readFile(join(FIXTURE_DIR, name), 'utf8')
}

afterEach(async () => {
  await Promise.all(homes.splice(0).map((home) => rm(home, { recursive: true, force: true })))
})

describe('scanCodex', () => {
  it('11. 真实 rollout 样本 → id/title/updatedAt 正确', async () => {
    const home = await makeHome()
    const fixtureC = await readFixture(FIXTURE_C)
    const fixtureA = await readFixture(FIXTURE_A)
    const filePathC = await putRollout(home, ['2026', '11', '06'], ROLLOUT_NAME_C, fixtureC)
    const filePathA = await putRollout(home, ['2026', '11', '06'], ROLLOUT_NAME_A, fixtureA)

    const candidates = await scanCodex(C_CWD, { homeDir: home })
    const byId = new Map(candidates.map((candidate) => [candidate.externalSessionId, candidate]))

    // 期望值逐条来自 fixture 实际内容:
    //   c:session_meta.payload.id = 01a1b0d7-…;无标题 → 取首条 UserMessage 文本(折叠空白 + 96 字符截断);
    //      最后一条 timestamp = task_complete 行 2026-11-06T12:31:38.787Z
    //   a:session_meta.payload.id = 01a1b0de-…;同样的标题规则;最后一条 timestamp = 12:39:21.577Z
    expect([...byId.keys()].sort()).toEqual([A_ID, C_ID].sort())
    expect(byId.get(C_ID)).toEqual({
      externalSessionId: C_ID,
      externalTitle: C_TITLE,
      filePath: filePathC,
      cwd: C_CWD,
      activityAt: C_ACTIVITY_AT
    })
    expect(byId.get(A_ID)).toMatchObject({
      externalSessionId: A_ID,
      externalTitle: A_TITLE,
      filePath: filePathA,
      activityAt: A_ACTIVITY_AT
    })
  })

  it('12. 两个存储位置同会话 → 只留一条(构造反例)', async () => {
    const home = await makeHome()
    const fixtureC = await readFixture(FIXTURE_C)
    // 同一条 rollout 被 bridging/backfill 复用到两个日期子目录:内容相同 = 同一 (thread id)
    await putRollout(home, ['2026', '11', '06'], ROLLOUT_NAME_C, fixtureC)
    await putRollout(home, ['2026', '11', '07'], ROLLOUT_NAME_C, fixtureC)

    const candidates = await scanCodex(C_CWD, { homeDir: home })

    expect(candidates).toHaveLength(1)
    expect(candidates[0].externalSessionId).toBe(C_ID)
    expect(candidates[0].externalTitle).toBe(C_TITLE)
  })

  it('13. .zst 变体文件 → 按优先级处理不崩(构造反例)', async () => {
    const home = await makeHome()
    const fixtureC = await readFixture(FIXTURE_C)
    const fixtureA = await readFixture(FIXTURE_A)
    // 明文只有 session_meta(归档后新建的 .jsonl 还没追加任何行),.zst 是完整历史:
    // Orca codex-rollout-compressed-twin 规则 = 明文不新于非空 .zst 时读 .zst(归档保留 mtime)
    const stalePlain = `${fixtureC.split('\n').find((line) => line.includes('"type":"session_meta"')) ?? ''}\n`
    const plainPath = await putRollout(home, ['2026', '11', '06'], ROLLOUT_NAME_C, stalePlain)
    const compressedPath = await putRollout(
      home,
      ['2026', '11', '06'],
      `${ROLLOUT_NAME_C}.zst`,
      zstdCompressSync(Buffer.from(fixtureC, 'utf8'))
    )
    await utimes(
      plainPath,
      new Date('2026-11-06T12:00:00.000Z'),
      new Date('2026-11-06T12:00:00.000Z')
    )
    await utimes(
      compressedPath,
      new Date('2026-11-06T12:40:00.000Z'),
      new Date('2026-11-06T12:40:00.000Z')
    )
    // 另一条只有 .zst、没有明文孪生:也要能解压出来
    await putRollout(
      home,
      ['2026', '11', '07'],
      `${ROLLOUT_NAME_A}.zst`,
      zstdCompressSync(Buffer.from(fixtureA, 'utf8'))
    )

    const candidates = await scanCodex(C_CWD, { homeDir: home })
    const byId = new Map(candidates.map((candidate) => [candidate.externalSessionId, candidate]))

    expect([...byId.keys()].sort()).toEqual([A_ID, C_ID].sort())
    // 读的是 .zst:标题与最后活动时间都来自完整历史(明文那份两条都给不出)
    expect(byId.get(C_ID)).toMatchObject({
      externalTitle: C_TITLE,
      activityAt: C_ACTIVITY_AT,
      filePath: compressedPath
    })
    expect(byId.get(A_ID)).toMatchObject({ externalTitle: A_TITLE, activityAt: A_ACTIVITY_AT })
  })

  it('14. 非会话文件混入 → 跳过(构造反例)', async () => {
    const home = await makeHome()
    const fixtureC = await readFixture(FIXTURE_C)
    await putRollout(home, ['2026', '11', '06'], ROLLOUT_NAME_C, fixtureC)
    // 同目录下的索引/配置/日志与「像 rollout 但不是 rollout」的文件名
    await putRollout(
      home,
      ['2026', '11', '06'],
      'sessions-index.json',
      '{"version":1,"entries":[]}'
    )
    await putRollout(home, ['2026', '11', '06'], 'config.toml', 'model = "gpt-5"\n')
    await putRollout(home, ['2026', '11', '06'], 'notes.jsonl', '{"type":"session_meta"}\n')
    await putRollout(home, ['2026', '11', '06'], `${ROLLOUT_NAME_C}.bak`, fixtureC)

    const candidates = await scanCodex(C_CWD, { homeDir: home })

    expect(candidates).toHaveLength(1)
    expect(candidates[0].externalSessionId).toBe(C_ID)
  })

  it('15. 空目录 → 返回空(约定)', async () => {
    const home = await makeHome()
    expect(await scanCodex(C_CWD, { homeDir: home })).toEqual([])

    // 连 .codex 都没有(未装 codex):同样返回空,不抛错
    const bareHome = await mkdtemp(join(tmpdir(), 'scan-codex-bare-'))
    homes.push(bareHome)
    expect(await scanCodex(C_CWD, { homeDir: bareHome })).toEqual([])
  })
})
