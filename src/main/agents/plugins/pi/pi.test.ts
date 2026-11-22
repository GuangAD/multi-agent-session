// 接缝 scanPi 模块行为测试(契约「测试规格」接缝 scanPi 第 1 条;三家坏样本第 5 条的 pi 部分)
// 期望值来源:
//   · 第 1 条:__fixtures__/pi-session-2026-11-20T11-30-31-486Z.jsonl 的实际内容——首行 type=session 的
//     id 与 cwd、首条 role=user 消息文本(文件里没有会话名字段,标题只能取它)、最后一条记录的 timestamp
//   · 第 5 条:构造反例(桶目录不存在 / 首行 JSON 半截)
// 全部用例把 homeDir 指到临时目录(scan 的 ctx 注入口),不读本机 ~/.pi。
import { afterEach, describe, expect, it } from 'vitest'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { scanPi } from './scan'

// Why:fixture 与本测试文件同目录,用 import.meta.dirname 定位,不读 process.cwd()(vitest 根一变即断)
const FIXTURE_DIR = join(import.meta.dirname, '__fixtures__')
const FIXTURE_NAME = 'pi-session-2026-11-20T11-30-31-486Z.jsonl'
// 本机样本被脱敏成 D:\工作区\alpha-app(见 fixture 首行 provenance);桶名按 pi 的编码手算:
// ':' 与 '\' 逐个换 '-',首尾各包 '--' → --D--工作区-alpha-app--
const FIXTURE_CWD = 'D:\\工作区\\alpha-app'
const PI_BUCKET = '--D--工作区-alpha-app--'
// pi 的会话文件名形态:<ISO 时间戳(冒号换 '-')>_<uuid>.jsonl
const FIXTURE_SESSION_FILE = '2026-11-20T11-30-31-486Z_01a1f8b8-edbc-7347-85f0-1df6cdbb3fc9.jsonl'

const homes: string[] = []

async function makeHome(): Promise<string> {
  const home = await mkdtemp(join(tmpdir(), 'scan-pi-'))
  homes.push(home)
  await mkdir(join(home, '.pi', 'agent', 'sessions'), { recursive: true })
  return home
}

async function putTranscript(
  home: string,
  bucket: string,
  fileName: string,
  content: string
): Promise<string> {
  const dir = join(home, '.pi', 'agent', 'sessions', bucket)
  await mkdir(dir, { recursive: true })
  const filePath = join(dir, fileName)
  await writeFile(filePath, content, 'utf8')
  return filePath
}

afterEach(async () => {
  await Promise.all(homes.splice(0).map((home) => rm(home, { recursive: true, force: true })))
})

describe('scanPi', () => {
  it('1. 真实 transcript 样本 → id/cwd/标题/转录路径与文件内容一致', async () => {
    const home = await makeHome()
    const fixture = await readFile(join(FIXTURE_DIR, FIXTURE_NAME), 'utf8')
    const filePath = await putTranscript(home, PI_BUCKET, FIXTURE_SESSION_FILE, fixture)
    // pi 还把子代理跑批写在桶内的会话子目录(<桶>/<时间戳>_<uuid>/<agentId>/run-0/session.jsonl):
    // 那不是独立会话,扫描不得递归(本机实测 9 桶 34 个顶层 .jsonl,全递归则 164 个)
    await putTranscript(
      home,
      join(PI_BUCKET, '2026-11-20T11-45-33-562Z_01a1f8c6-b179-71d0-b12e-28c7acdc4c55', 'run-child'),
      'session.jsonl',
      fixture
    )

    const candidates = await scanPi(FIXTURE_CWD, { homeDir: home })

    // 期望值逐条来自 fixture 实际内容:
    //   首行 type=session 的 id = 01a1f8b8-edbc-7347-85f0-1df6cdbb3fc9,cwd = D:\工作区\alpha-app
    //   首条 role=user 消息文本 = 当前安装的pnpm版本与项目不符，能否正常运行呢(短于 96 字符,不截断)
    //   它前面那行是 role=system 的 harness 系统提示(脱敏时截成一行占位):取错角色就会拿到它
    //   最后一条记录的 timestamp = 2026-11-20T11:38:54.796Z(首行 timestamp 是 11:30:31.486Z,不动)
    expect(candidates).toEqual([
      {
        externalSessionId: '01a1f8b8-edbc-7347-85f0-1df6cdbb3fc9',
        externalTitle: '当前安装的pnpm版本与项目不符，能否正常运行呢',
        filePath,
        cwd: FIXTURE_CWD,
        activityAt: '2026-11-20T11:38:54.796Z'
      }
    ])
  })

  it('5. 桶目录不存在 / 首行半截 → 返回空,不崩(构造反例)', async () => {
    const home = await makeHome()
    // 未装 pi 或该项目从未建过会话:根在、桶不在
    expect(await scanPi('D:\\work\\alpha', { homeDir: home })).toEqual([])

    // 半截:崩溃时首行没写完,解析不出 cwd 就不产出候选
    await putTranscript(
      home,
      '--D--work-alpha--',
      '2026-11-21T00-00-00-000Z_cccc1111-2222-4333-8444-555566667777.jsonl',
      '{"type":"session","version":3,"id":"cccc1111-2222-4333-8444-555566667777","timestamp":"2026-11-21T00:00:00.000Z","cwd":"D:\\\\work\\\\alpha'
    )
    expect(await scanPi('D:\\work\\alpha', { homeDir: home })).toEqual([])
  })
})
