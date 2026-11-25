// 接缝 storePersistence 模块行为测试(契约「测试规格」五条 + Important-1 并发守卫)
// 期望值来源:手算字面量与构造反例,不经 IPC,直接调用函数。
import { access, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { DEFAULT_STORE, loadStore, saveStoreAtomic } from './store-persistence'
import type { AppStore } from '../../shared/types'

let dir: string
let file: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'agent-sessions-store-'))
  file = join(dir, 'store.json')
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

// 手算字面量:含 projects/sessions/settings 的完整 store
const FILLED_STORE: AppStore = {
  version: 1,
  projects: [{ id: 'p-1', path: 'D:\\demo', name: 'demo' }],
  sessions: [],
  settings: {
    defaultAgentId: 'claude',
    scrollbackRows: 25000,
    appTheme: 'carbonfox',
    terminalTheme: 'Tango Dark',
    shell: 'cmd',
    terminalFontFamily: 'JetBrains Mono',
    terminalFontSize: 20,
    terminalFontWeight: 400,
    terminalLineHeight: 1.5,
    terminalCursorStyle: 'bar',
    terminalCursorBlink: true
  }
}

// 主题样式 T2 默认值字面量(照抄 spec 数据结构节):供「缺字段补默认」断言使用,
// 独立于 DEFAULT_STORE 的字面量,防同源比较掩盖默认值本身写错
const DEFAULT_SETTINGS_WITH_NEW_FIELDS = {
  scrollbackRows: 10000,
  appTheme: 'github-dark',
  terminalTheme: 'Ghostty Default Style Dark',
  shell: 'powershell',
  terminalFontSize: 14,
  terminalFontWeight: 300,
  terminalLineHeight: 1.0,
  terminalCursorStyle: 'block',
  terminalCursorBlink: false
} as const

it('写入再读取,字段与值完全一致', async () => {
  await saveStoreAtomic(file, FILLED_STORE)
  await expect(loadStore(file)).resolves.toEqual(FILLED_STORE)
})

it('原子写后目录只有目标文件,无 .tmp 残留', async () => {
  await saveStoreAtomic(file, FILLED_STORE)
  expect(await readdir(dir)).toEqual(['store.json'])
})

it('半截 JSON:返回 DEFAULT_STORE,原文件改名 .corrupt-* 留存', async () => {
  const broken = '{"version":1,"projects":[{"id":"p-1"'
  await writeFile(file, broken, 'utf8')
  await expect(loadStore(file)).resolves.toEqual(DEFAULT_STORE)
  const entries = await readdir(dir)
  const corruptFiles = entries.filter((name) => name.startsWith('store.json.corrupt-'))
  expect(corruptFiles).toHaveLength(1)
  expect(await readFile(join(dir, corruptFiles[0]), 'utf8')).toBe(broken)
  expect(entries).not.toContain('store.json')
})

it('合法 JSON 缺 settings 字段:settings 补默认,projects 保留', async () => {
  await writeFile(
    file,
    JSON.stringify({ version: 1, projects: [{ id: 'p-keep', path: 'D:\\keep', name: 'keep' }] }),
    'utf8'
  )
  const loaded = await loadStore(file)
  // 手算默认值:scrollbackRows 10000、theme system(spec 默认);T2 起含主题/终端外观新字段全默认
  expect(loaded.settings).toEqual(DEFAULT_SETTINGS_WITH_NEW_FIELDS)
  expect(loaded.projects).toEqual([{ id: 'p-keep', path: 'D:\\keep', name: 'keep' }])
  // 未走损坏兜底:原文件仍在
  await expect(access(file)).resolves.toBeUndefined()
})

it('二进制垃圾:返回 DEFAULT_STORE,不抛未捕获异常', async () => {
  await writeFile(file, Buffer.from([0x00, 0xff, 0xfe, 0x10, 0x80, 0x63, 0x9c]))
  await expect(loadStore(file)).resolves.toEqual(DEFAULT_STORE)
  expect((await readdir(dir)).some((name) => name.startsWith('store.json.corrupt-'))).toBe(true)
})

// Important-1 守卫:构造反例——8 个写者内容互不相同,全部并发(各 3 轮)保存
it('并发保存:8 写者各 3 轮并发,最终为其中一次写入的完整内容,目录无 .tmp 残留', async () => {
  const contents: AppStore[] = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({
    ...FILLED_STORE,
    projects: [{ id: `p-${n}`, path: `D:\\demo-${n}`, name: `demo-${n}` }]
  }))
  // 每个写者独立串行 3 轮,8 条链同时开跑,放大固定 tmp 名的交错窗口
  await Promise.all(
    contents.map(async (store) => {
      for (let round = 0; round < 3; round += 1) {
        await saveStoreAtomic(file, store)
      }
    })
  )
  const loaded = await loadStore(file)
  // 发布的必须是某一次写入的完整 JSON 内容(交错字节/截断/损坏兜底的 DEFAULT_STORE 都不在其中)
  expect(contents).toContainEqual(loaded)
  // 全部 rename 消费各自的 tmp、失败路径 best-effort 清理:目录只剩目标文件
  expect(await readdir(dir)).toEqual(['store.json'])
})

// ============ 主题单槽改造 T-R1:旧字段迁移 + 新字段补默认(spec 接缝三迁移行)============
it('T-R1 用例 1:第一版文件(三态 + 双槽)读入,旧主题 id 迁到默认,目录内终端主题名保留,旧键不残留', async () => {
  await writeFile(
    file,
    JSON.stringify({
      version: 1,
      projects: [],
      sessions: [],
      settings: {
        scrollbackRows: 5000,
        theme: 'dark',
        shell: 'cmd',
        appThemeDark: 'warm',
        appThemeLight: 'cool',
        terminalThemeDark: 'Tango Dark',
        terminalThemeLight: 'Builtin Tango Light'
      }
    }),
    'utf8'
  )
  const loaded = await loadStore(file)
  // 独立字面量而非 DEFAULT_STORE 同源比较,防默认值本身写错被掩盖;
  // toEqual 同时证明五个旧键不进入内存 store(否则整文件写回会把旧字段永久带着走)
  expect(loaded.settings).toEqual({
    ...DEFAULT_SETTINGS_WITH_NEW_FIELDS,
    scrollbackRows: 5000,
    appTheme: 'github-dark', // 旧 id 'warm' 不在 12 套目录 → 落默认
    terminalTheme: 'Tango Dark', // 仍在 22 套目录 → 迁移成功
    shell: 'cmd'
  })
  // 未走损坏兜底:原文件仍在
  await expect(access(file)).resolves.toBeUndefined()
})

it('T-R1 用例 2:第一版文件双槽旧 id 全不在新目录,两字段各自独立兜底', async () => {
  await writeFile(
    file,
    JSON.stringify({
      version: 1,
      projects: [],
      sessions: [],
      settings: {
        appThemeDark: 'warm',
        appThemeLight: 'cool',
        terminalThemeDark: 'Nope Dark',
        terminalThemeLight: 'Nope Light'
      }
    }),
    'utf8'
  )
  await expect(loadStore(file)).resolves.toEqual({
    version: 1,
    projects: [],
    sessions: [],
    settings: DEFAULT_SETTINGS_WITH_NEW_FIELDS
  })
})

it('T-R1 用例 3:新格式文件全字段读入,原值保留不清洗(越界值也不在 load 层夹紧)', async () => {
  const fileSettings = {
    defaultAgentId: 'claude',
    scrollbackRows: 25000,
    appTheme: 'carbonfox',
    terminalTheme: 'Tango Light',
    shell: 'cmd',
    terminalFontFamily: 'JetBrains Mono',
    terminalFontSize: 99,
    terminalFontWeight: 500,
    terminalLineHeight: 3,
    terminalCursorStyle: 'underline',
    terminalCursorBlink: true
  }
  await writeFile(
    file,
    JSON.stringify({ version: 1, projects: [], sessions: [], settings: fileSettings }),
    'utf8'
  )
  await expect(loadStore(file)).resolves.toEqual({
    version: 1,
    projects: [],
    sessions: [],
    settings: fileSettings
  })
})

it('T-R1 用例 4:新格式文件缺 appTheme,缺的补默认,其余保留(迁移只补缺不改有)', async () => {
  await writeFile(
    file,
    JSON.stringify({
      version: 1,
      projects: [],
      sessions: [],
      settings: { terminalTheme: 'Gruvbox Light' }
    }),
    'utf8'
  )
  const loaded = await loadStore(file)
  expect(loaded.settings).toEqual({
    ...DEFAULT_SETTINGS_WITH_NEW_FIELDS,
    terminalTheme: 'Gruvbox Light'
  })
})

it('T-R1 用例 5:新格式文件缺 terminalFontSize,补默认,其余保留', async () => {
  await writeFile(
    file,
    JSON.stringify({
      version: 1,
      projects: [],
      sessions: [],
      settings: {
        scrollbackRows: 12000,
        appTheme: 'tomorrow',
        terminalTheme: 'Builtin Tango Light',
        shell: 'pwsh',
        terminalFontFamily: 'Consolas',
        terminalFontWeight: 500,
        terminalLineHeight: 1.2,
        terminalCursorStyle: 'bar',
        terminalCursorBlink: true
      }
    }),
    'utf8'
  )
  const loaded = await loadStore(file)
  expect(loaded.settings).toEqual({
    scrollbackRows: 12000,
    appTheme: 'tomorrow',
    terminalTheme: 'Builtin Tango Light',
    shell: 'pwsh',
    terminalFontFamily: 'Consolas',
    terminalFontSize: 14, // 缺 → 补默认
    terminalFontWeight: 500,
    terminalLineHeight: 1.2,
    terminalCursorStyle: 'bar',
    terminalCursorBlink: true
  })
})

it('T-R1 用例 6:settings 为字符串,走既有兜底路径返回全默认,不抛出且不隔离原文件', async () => {
  await writeFile(
    file,
    JSON.stringify({ version: 1, projects: [], sessions: [], settings: 'broken' }),
    'utf8'
  )
  const loaded = await loadStore(file)
  // 期望值用独立字面量:兜底给出的必须是含新字段的全默认,而非旧字段
  expect(loaded.settings).toEqual(DEFAULT_SETTINGS_WITH_NEW_FIELDS)
  // settings 是字符串但整文件仍是合法 JSON 对象:不触发 .corrupt-* 隔离
  await expect(access(file)).resolves.toBeUndefined()
})

it('T-R1 用例 7:首个旧槽值不在目录时继续试第二个(评审 I1)', async () => {
  await writeFile(
    file,
    JSON.stringify({
      version: 1,
      projects: [],
      sessions: [],
      settings: {
        appThemeDark: 'warm', // 不在 12 套目录
        appThemeLight: 'github-light', // 在目录 → 应取它,而不是直接落默认
        terminalThemeDark: 'Nope Dark', // 不在 22 套目录
        terminalThemeLight: 'Builtin Tango Light' // 在目录 → 应取它
      }
    }),
    'utf8'
  )
  const loaded = await loadStore(file)
  expect(loaded.settings).toEqual({
    ...DEFAULT_SETTINGS_WITH_NEW_FIELDS,
    appTheme: 'github-light',
    terminalTheme: 'Builtin Tango Light'
  })
})
