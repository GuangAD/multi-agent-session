// 接缝 scanAntigravity 模块行为测试(契约「测试规格」接缝 scanAntigravity 第 4 条;三家坏样本第 5 条的 antigravity 部分)
// 期望值来源:
//   · 第 4 条:__fixtures__/antigravity-transcript-opening-prompt.jsonl(开场提示 10:00:00.000Z)与
//     antigravity-history.jsonl(10:00:00.100Z 那行指向 alpha-app)的实际内容;history 里还给后续提示
//     配了 beta-app 的行——取错提示(用最后一条而不是开场那条)就会关联到 beta-app,用例能抓住
//   · 第 4b 条:antigravity-conversation-metadata.json 的 WorkspaceURIs(file:///D%3A/…/alpha-app)
//   · 第 5 条:构造反例(会话根不存在 / transcript 行半截)
// 本机未装 antigravity:样本由 Orca 测试样本工厂改造而来(fixture 首行有 provenance),不是本机采样。
import { afterEach, describe, expect, it } from 'vitest'
import { mkdir, mkdtemp, readFile, rm, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { scanAntigravity } from './scan'

const FIXTURE_DIR = join(import.meta.dirname, '__fixtures__')
const TRANSCRIPT_FIXTURE = 'antigravity-transcript-opening-prompt.jsonl'
const HISTORY_FIXTURE = 'antigravity-history.jsonl'
const METADATA_FIXTURE = 'antigravity-conversation-metadata.json'

const PROJECT_ALPHA = 'D:\\工作区\\alpha-app'
// 目录名即会话 id(Orca antigravityConversationIdFromTranscriptPath:brain/<id>/.system_generated/logs/…)
const CONVERSATION_ID = 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff'
// 与 antigravity-conversation-metadata.json 的 conversations 键一致
const WORKSPACE_URI_CONVERSATION_ID = '4f8e2a1c-9b3d-4e57-8c21-1d0e5b9a7c30'

const homes: string[] = []

async function makeHome(): Promise<string> {
  const home = await mkdtemp(join(tmpdir(), 'scan-antigravity-'))
  homes.push(home)
  await mkdir(join(home, '.gemini', 'antigravity-cli', 'brain'), { recursive: true })
  return home
}

function brainDir(home: string): string {
  return join(home, '.gemini', 'antigravity-cli', 'brain')
}

// 布局:~/.gemini/antigravity-cli/brain/<会话 id>/.system_generated/logs/transcript[ _full].jsonl;
// history 与 cache/ 在该 agent 根下(Orca antigravityHistoryPathForBrainDir / antigravityCachePath)
async function putTranscript(
  home: string,
  conversationId: string,
  fileName: string,
  content: string
): Promise<string> {
  const dir = join(brainDir(home), conversationId, '.system_generated', 'logs')
  await mkdir(dir, { recursive: true })
  const filePath = join(dir, fileName)
  await writeFile(filePath, content, 'utf8')
  return filePath
}

async function putHistory(home: string, content: string): Promise<string> {
  const filePath = join(home, '.gemini', 'antigravity-cli', 'history.jsonl')
  await writeFile(filePath, content, 'utf8')
  return filePath
}

async function putCache(home: string, fileName: string, content: string): Promise<void> {
  const dir = join(home, '.gemini', 'antigravity-cli', 'cache')
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, fileName), content, 'utf8')
}

async function readFixture(name: string): Promise<string> {
  return readFile(join(FIXTURE_DIR, name), 'utf8')
}

afterEach(async () => {
  await Promise.all(homes.splice(0).map((home) => rm(home, { recursive: true, force: true })))
})

describe('scanAntigravity', () => {
  it('4. 无 cwd 字段的会话 → 首条 prompt 的 hash 唯一命中 history 行,关联到该目录', async () => {
    const home = await makeHome()
    const transcript = await readFixture(TRANSCRIPT_FIXTURE)
    await putTranscript(home, CONVERSATION_ID, 'transcript.jsonl', transcript)
    // 同一会话的另一落盘形态:候选只能出现一条。两份显式设成同一 mtime,把「mtime 相同 → full 作
    // tiebreak」这条分支钉死(不依赖两次写入的先后顺序;mtime 不同时由用例 4c 覆盖)
    const fullPath = await putTranscript(home, CONVERSATION_ID, 'transcript_full.jsonl', transcript)
    const sameMoment = new Date('2026-05-01T09:59:59.000Z')
    await utimes(
      join(brainDir(home), CONVERSATION_ID, '.system_generated', 'logs', 'transcript.jsonl'),
      sameMoment,
      sameMoment
    )
    await utimes(fullPath, sameMoment, sameMoment)
    await putHistory(home, await readFixture(HISTORY_FIXTURE))

    const candidates = await scanAntigravity(PROJECT_ALPHA, { homeDir: home })

    // 期望值来自 fixture 实际内容:标题 = 开场 <USER_REQUEST> 里的文本;
    // 时间线取最后一条记录(10:01:00.000Z 的后续用户输入),不是开场那条
    expect(candidates).toEqual([
      {
        externalSessionId: CONVERSATION_ID,
        externalTitle: '校准终端字体度量',
        filePath: fullPath,
        cwd: 'D:\\工作区\\alpha-app',
        activityAt: '2026-05-01T10:01:00.000Z'
      }
    ])
  })

  it('4b. history 无对应行 → WorkspaceURIs 关联到该目录', async () => {
    const home = await makeHome()
    await putTranscript(
      home,
      WORKSPACE_URI_CONVERSATION_ID,
      'transcript.jsonl',
      await readFixture(TRANSCRIPT_FIXTURE)
    )
    // 没有 history.jsonl:只有 conversation_metadata.json 的 WorkspaceURIs 能说出目录
    await putCache(home, 'conversation_metadata.json', await readFixture(METADATA_FIXTURE))

    const candidates = await scanAntigravity(PROJECT_ALPHA, { homeDir: home })

    expect(candidates.map((candidate) => [candidate.externalSessionId, candidate.cwd])).toEqual([
      [WORKSPACE_URI_CONVERSATION_ID, PROJECT_ALPHA]
    ])
  })

  it('4c. 两种落盘形态并存 → 取 mtime 更新的那份(transcript.jsonl 比 full 新)', async () => {
    // 期望值来源:Orca prioritizeAntigravityTranscriptCandidates 按 candidateFileTime 降序;
    // 时间相同才用 transcript_full 作 tiebreak。这里把 transcript.jsonl 的 mtime 设得更新。
    const home = await makeHome()
    const transcript = await readFixture(TRANSCRIPT_FIXTURE)
    const fullPath = await putTranscript(home, CONVERSATION_ID, 'transcript_full.jsonl', transcript)
    const plainPath = await putTranscript(home, CONVERSATION_ID, 'transcript.jsonl', transcript)
    // 手算:full 设为 10:00,plain 设为 11:00 → plain 更新
    await utimes(
      fullPath,
      new Date('2026-05-01T10:00:00.000Z'),
      new Date('2026-05-01T10:00:00.000Z')
    )
    await utimes(
      plainPath,
      new Date('2026-05-01T11:00:00.000Z'),
      new Date('2026-05-01T11:00:00.000Z')
    )
    await putHistory(home, await readFixture(HISTORY_FIXTURE))

    const candidates = await scanAntigravity(PROJECT_ALPHA, { homeDir: home })

    expect(candidates.map((candidate) => candidate.filePath)).toEqual([plainPath])
  })

  it('4d. 同 hash 的 history 行超出 ±2s 窗口 → 不关联,该会话不产出', async () => {
    // 期望值来源:Orca HISTORY_MATCH_WINDOW_MS = 2000(外部参照)+ 手算(开场 10:00:00,history 行 10:00:05)
    const home = await makeHome()
    await putTranscript(
      home,
      CONVERSATION_ID,
      'transcript.jsonl',
      await readFixture(TRANSCRIPT_FIXTURE)
    )
    await putHistory(
      home,
      JSON.stringify({
        display: '校准终端字体度量',
        workspace: 'D:\\工作区\\alpha-app',
        timestamp: 1777629605
      }) + '\n'
    )

    expect(await scanAntigravity(PROJECT_ALPHA, { homeDir: home })).toEqual([])
  })

  it('4e. 同 hash 的 history 行在窗口内出现两次 → 无法唯一命中,该会话不产出', async () => {
    // 期望值来源:同一条提示可能在不同项目里各跑过一次(Orca workspaceByOpeningPrompt 要求 matches.length === 1)
    const home = await makeHome()
    await putTranscript(
      home,
      CONVERSATION_ID,
      'transcript.jsonl',
      await readFixture(TRANSCRIPT_FIXTURE)
    )
    await putHistory(
      home,
      [
        JSON.stringify({
          display: '校准终端字体度量',
          workspace: 'D:\\工作区\\alpha-app',
          timestamp: 1777629600.1
        }),
        JSON.stringify({
          display: '校准终端字体度量',
          workspace: 'D:\\工作区\\beta-app',
          timestamp: 1777629600.9
        })
      ].join('\n') + '\n'
    )

    expect(await scanAntigravity(PROJECT_ALPHA, { homeDir: home })).toEqual([])
  })

  it('5. 会话根不存在 / transcript 行半截 → 返回空,不崩(构造反例)', async () => {
    const home = await makeHome()
    // 未装 antigravity:brain 根在、没有会话目录
    expect(await scanAntigravity(PROJECT_ALPHA, { homeDir: home })).toEqual([])

    // 半截:唯一一条用户记录没写完,既无开场 prompt 也无时间线 → 不产出候选
    await putTranscript(
      home,
      CONVERSATION_ID,
      'transcript.jsonl',
      '{"source":"USER_EXPLICIT","type":"USER_INPUT","created_at":"2026-05-01T10:00:00.000Z","content":"<USER_REQUEST>半截'
    )
    expect(await scanAntigravity(PROJECT_ALPHA, { homeDir: home })).toEqual([])
  })
})
