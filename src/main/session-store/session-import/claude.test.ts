// 接缝 scanClaude 模块行为测试(契约「测试规格」第 6–10 条)
// 期望值来源:
//   · 第 6 条:手算编码目录名(非字母数字逐字符换 '-'):D:\我的项目\my app.v2 → D-------my-app-v2
//   · 第 7/8/10 条:构造反例(磁盘大小写不一致 / 超 200 字符 hash 桶 / 空目录与半截文件)
//   · 第 9 条:__fixtures__/4b0c9d2e-….jsonl 的实际内容(id/customTitle/最后时间戳)
// 全部用例把 homeDir 指到临时目录(scan 的 ctx 注入口),不读本机 ~/.claude。
import { afterEach, describe, expect, it } from 'vitest'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { scanClaude } from './claude'

// Why:fixture 与本测试文件同目录,用 import.meta.dirname 定位,不读 process.cwd()(vitest 根一变即断,评审 Minor-B)。
const FIXTURE_DIR = join(import.meta.dirname, '__fixtures__')
// 第 9 条的真实回放件:文件名即 claude 的会话 id
const FIXTURE_NAME = '4b0c9d2e-7a55-4c31-9a4f-2f1f5f4a8d10.jsonl'
const FIXTURE_CWD = 'D:\\我的项目\\my app.v2'

const homes: string[] = []

async function makeHome(): Promise<string> {
  const home = await mkdtemp(join(tmpdir(), 'scan-claude-'))
  homes.push(home)
  await mkdir(join(home, '.claude', 'projects'), { recursive: true })
  return home
}

async function putFile(
  home: string,
  bucket: string,
  fileName: string,
  content: string
): Promise<string> {
  const dir = join(home, '.claude', 'projects', bucket)
  await mkdir(dir, { recursive: true })
  const filePath = join(dir, fileName)
  await writeFile(filePath, content, 'utf8')
  return filePath
}

function transcript(cwd: string, sessionId: string, prompt: string): string {
  return `${JSON.stringify({
    type: 'user',
    uuid: '00000000-0000-4000-8000-000000000001',
    parentUuid: null,
    sessionId,
    cwd,
    timestamp: '2026-11-19T09:00:00.000Z',
    message: { role: 'user', content: prompt }
  })}\n`
}

afterEach(async () => {
  await Promise.all(homes.splice(0).map((home) => rm(home, { recursive: true, force: true })))
})

describe('scanClaude', () => {
  it('6. 含中文/空格/点的项目路径 → 编码目录定位成功', async () => {
    const home = await makeHome()
    const fixture = await readFile(join(FIXTURE_DIR, FIXTURE_NAME), 'utf8')
    // 手算编码:D : / 我的项目(4 字)/ 空格 / 点 全部逐字符换 '-'
    await putFile(home, 'D-------my-app-v2', FIXTURE_NAME, fixture)
    // 目录里的索引文件不是 transcript,必须跳过(Claude Code 与 transcript 同目录写索引)
    await putFile(home, 'D-------my-app-v2', 'sessions-index.json', '{"version":1,"entries":[]}')

    const candidates = await scanClaude(FIXTURE_CWD, { homeDir: home })

    expect(candidates).toHaveLength(1)
    expect(candidates[0]).toMatchObject({
      externalSessionId: '4b0c9d2e-7a55-4c31-9a4f-2f1f5f4a8d10',
      cwd: FIXTURE_CWD
    })
  })

  it('7. 磁盘大小写不一致的编码目录 → 仍命中(构造反例)', async () => {
    const home = await makeHome()
    // 磁盘上是 D--Work-MyApp,项目路径记的是 d:\work\myapp:编码结果只差大小写
    await putFile(
      home,
      'D--Work-MyApp',
      'aaaa1111-2222-4333-8444-555566667777.jsonl',
      transcript('D:\\Work\\MyApp', 'aaaa1111-2222-4333-8444-555566667777', '大小写不一致的目录')
    )

    const candidates = await scanClaude('d:\\work\\myapp', { homeDir: home })

    expect(candidates).toHaveLength(1)
    expect(candidates[0].externalSessionId).toBe('aaaa1111-2222-4333-8444-555566667777')
    // cwd 是 agent 侧原始记录,不预归一化(归一化归 matchProjectDir)
    expect(candidates[0].cwd).toBe('D:\\Work\\MyApp')
  })

  it('8. 超 200 字符路径 → hash 桶命中(构造反例)', async () => {
    const home = await makeHome()
    // 45 段 'aaaa':路径 227 字符
    const longProjectPath = `D:\\${Array.from({ length: 45 }, () => 'aaaa').join('\\')}`
    // 手算:编码 = 'D-' + '-aaaa' × 45 = 227 字符;Claude Code 的长路径桶取前 200 字符 + '-' + hash
    const encodedLongPath = `D-${'-aaaa'.repeat(45)}`
    const bucketNamePrefix = `D-${'-aaaa'.repeat(39)}-aa`
    expect(encodedLongPath).toHaveLength(227)
    expect(bucketNamePrefix).toHaveLength(200)

    await putFile(
      home,
      `${bucketNamePrefix}-1f9c4a1b7d3e5a60`,
      'bbbb1111-2222-4333-8444-555566667777.jsonl',
      transcript(longProjectPath, 'bbbb1111-2222-4333-8444-555566667777', '超长路径的项目')
    )

    const candidates = await scanClaude(longProjectPath, { homeDir: home })

    expect(candidates).toHaveLength(1)
    expect(candidates[0].externalSessionId).toBe('bbbb1111-2222-4333-8444-555566667777')
  })

  it('9. 真实 jsonl 样本 → id/title/updatedAt 与文件内容一致', async () => {
    const home = await makeHome()
    const fixture = await readFile(join(FIXTURE_DIR, FIXTURE_NAME), 'utf8')
    const filePath = await putFile(home, 'D-------my-app-v2', FIXTURE_NAME, fixture)

    const candidates = await scanClaude(FIXTURE_CWD, { homeDir: home })

    // 期望值逐条来自 fixture 实际内容:
    //   sessionId 行 = 4b0c9d2e-7a55-4c31-9a4f-2f1f5f4a8d10
    //   标题取 custom-title 的 customTitle(压过 ai-title 与 agent-name,也压过首条用户提示)
    //   最后一条带 timestamp 的记录是 09:00:30.000Z
    expect(candidates).toEqual([
      {
        externalSessionId: '4b0c9d2e-7a55-4c31-9a4f-2f1f5f4a8d10',
        externalTitle: '终端渲染字体度量校准',
        filePath,
        cwd: FIXTURE_CWD,
        activityAt: '2026-11-19T09:00:30.000Z'
      }
    ])
  })

  it('10. 空目录 / 半截文件 → 返回空,不崩(构造反例)', async () => {
    const home = await makeHome()
    expect(await scanClaude('D:\\work\\alpha', { homeDir: home })).toEqual([])

    // 半截文件:唯一一行的 JSON 没写完(崩溃时被截断的 transcript),解析不出 cwd 就不产出候选
    await putFile(
      home,
      'D--work-alpha',
      'cccc1111-2222-4333-8444-555566667777.jsonl',
      '{"type":"user","sessionId":"cccc1111-2222-4333-8444-555566667777","cwd":"D:\\\\work\\\\alpha","message":{"content":"cut'
    )
    expect(await scanClaude('D:\\work\\alpha', { homeDir: home })).toEqual([])
  })
})
