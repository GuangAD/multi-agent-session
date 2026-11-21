// 接缝 scanKimi 模块行为测试(契约「测试规格」接缝 scanKimi 第 2、3 条;三家坏样本第 5 条的 kimi 部分)
// 期望值来源:
//   · 第 2 条:Orca kimi 扫描器(外部参照)session-scanner-kimi-paths.ts 的
//     `kimiSessionIdFromStatePath` = 会话目录名,注释写明「Keep the session_ directory prefix:
//     kimi --session expects it as part of the ID」
//   · 第 3 条:__fixtures__/kimi-state-iso.json、kimi-state-epoch-ms.json、kimi-session-index.jsonl 的实际内容
//     (标题取 state.title,其次是 state.lastPrompt;cwd 取索引行的 workDir;时间戳两种形态各一)
//   · 第 5 条:构造反例(会话根不存在 / state.json 半截)
// 本机未装 kimi:样本按 Orca 读取键构造(fixture 首行/首键有 provenance),不是本机采样。
import { afterEach, describe, expect, it } from 'vitest'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { scanKimi } from './kimi'

const FIXTURE_DIR = join(import.meta.dirname, '__fixtures__')
const INDEX_FIXTURE = 'kimi-session-index.jsonl'
const STATE_ISO_FIXTURE = 'kimi-state-iso.json'
const STATE_EPOCH_FIXTURE = 'kimi-state-epoch-ms.json'

const PROJECT_ALPHA = 'D:\\工作区\\alpha-app'
// 目录名即会话 id,前缀属于 id 本身(Orca kimiSessionIdFromStatePath)
const SESSION_ALPHA = 'session_01a1f9ad-1111-7001-9001-00000000000a'
const SESSION_BETA = 'session_01a1f9ad-2222-7002-9002-00000000000b'
// 只在 state.json 侧存在、索引里没有行 → 解析不出 cwd,不产出候选(构造反例)
const SESSION_NO_INDEX = 'session_01a1f9ad-3333-7003-9003-00000000000c'

const homes: string[] = []

async function makeHome(): Promise<string> {
  const home = await mkdtemp(join(tmpdir(), 'scan-kimi-'))
  homes.push(home)
  await mkdir(join(home, '.kimi-code', 'sessions'), { recursive: true })
  return home
}

// 布局:~/.kimi-code/sessions/<工作区目录>/<session_ 目录>/state.json,索引在 ~/.kimi-code/session_index.jsonl。
// Why 工作区目录名随便取:Orca 明确「Derive the index from the discovered layout rather than trusting paths
// embedded in state.json」——cwd 的唯一靠山是索引行,不是目录名。
async function putSession(
  home: string,
  workspaceDirName: string,
  sessionDirectoryName: string,
  stateJson: string
): Promise<string> {
  const dir = join(home, '.kimi-code', 'sessions', workspaceDirName, sessionDirectoryName)
  await mkdir(dir, { recursive: true })
  const statePath = join(dir, 'state.json')
  await writeFile(statePath, stateJson, 'utf8')
  return statePath
}

async function putIndex(home: string, content: string): Promise<void> {
  await writeFile(join(home, '.kimi-code', 'session_index.jsonl'), content, 'utf8')
}

async function readFixture(name: string): Promise<string> {
  return readFile(join(FIXTURE_DIR, name), 'utf8')
}

afterEach(async () => {
  await Promise.all(homes.splice(0).map((home) => rm(home, { recursive: true, force: true })))
})

describe('scanKimi', () => {
  it('2. 会话目录 session_<id> → externalSessionId 保留 session_ 前缀', async () => {
    const home = await makeHome()
    await putSession(home, 'alpha-app', SESSION_ALPHA, await readFixture(STATE_ISO_FIXTURE))
    await putIndex(home, await readFixture(INDEX_FIXTURE))

    const candidates = await scanKimi(PROJECT_ALPHA, { homeDir: home })

    expect(candidates.map((candidate) => candidate.externalSessionId)).toEqual([SESSION_ALPHA])
    // 前缀是 id 的一部分(去掉它 kimi --session 找不到会话),不是可丢的装饰
    expect(candidates[0]?.externalSessionId.startsWith('session_')).toBe(true)
  })

  it('3. state.json 与 session_index 双源 → 标题取 state、cwd 取索引,缺任一侧不产出候选', async () => {
    const home = await makeHome()
    const stateAlpha = await putSession(
      home,
      'alpha-app',
      SESSION_ALPHA,
      await readFixture(STATE_ISO_FIXTURE)
    )
    const stateBeta = await putSession(
      home,
      'beta-app',
      SESSION_BETA,
      await readFixture(STATE_EPOCH_FIXTURE)
    )
    // 半截反例的正面形态:state.json 完好、索引无行 —— 两源缺一,候选没有 cwd,不许出现
    await putSession(home, 'gamma-app', SESSION_NO_INDEX, await readFixture(STATE_EPOCH_FIXTURE))
    await putIndex(home, await readFixture(INDEX_FIXTURE))

    const candidates = await scanKimi(PROJECT_ALPHA, { homeDir: home })

    // 期望值逐条来自 fixture 实际内容(state 侧)与索引行(index 侧),按 activityAt 倒序:
    //   beta:无 title → 取 lastPrompt;时间戳是 epoch 毫秒 1794450600456 = 2026-11-12T02:30:00.456Z
    //   alpha:title 压过 lastPrompt;时间戳是 ISO 串 2026-11-05T09:40:00.789Z(updatedAt 晚于 createdAt)
    expect(candidates).toEqual([
      {
        externalSessionId: SESSION_BETA,
        externalTitle: '把侧栏的排序改成按活动时间倒序',
        filePath: stateBeta,
        cwd: 'D:\\工作区\\beta-app',
        activityAt: '2026-11-12T02:30:00.456Z'
      },
      {
        externalSessionId: SESSION_ALPHA,
        externalTitle: '终端渲染字体度量校准',
        filePath: stateAlpha,
        cwd: 'D:\\工作区\\alpha-app',
        activityAt: '2026-11-05T09:40:00.789Z'
      }
    ])
  })

  it('5. 会话根不存在 / state.json 半截 → 返回空,不崩(构造反例)', async () => {
    const home = await makeHome()
    // 未装 kimi:连 sessions 根都没有
    expect(await scanKimi(PROJECT_ALPHA, { homeDir: home })).toEqual([])

    await putSession(home, 'alpha-app', SESSION_ALPHA, '{"title":"半截的 state.json","lastPro')
    expect(await scanKimi(PROJECT_ALPHA, { homeDir: home })).toEqual([])
  })
})
