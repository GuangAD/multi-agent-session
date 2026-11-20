// 接缝 resolveCommandPath 模块行为测试(契约「测试规格」第 6–10 条 + 评审守卫:POSIX 分支裸名)
// 期望值来源:构造的假 PATH 环境(临时目录真实落文件)+ 手算字面量;不经 IPC,直接调用函数。
// 平台:本仓首发平台 Windows(测试宿主 win32),win32 分支(引号剥离/PATHEXT/先搜当前目录)即真实分支;
// POSIX 分支经 platform:'linux' 注入做合成覆盖(守卫用例,真实 fs 命中)。
import { mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join, win32 as winPath } from 'node:path'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { resolveCommandPath } from './command-path-resolver'

let root: string
let emptyCwd: string // win32「先搜当前目录」:每条用例注入空 cwd,避免误扫真实项目目录

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'agent-sessions-cmdpath-'))
  emptyCwd = await mkdtemp(join(tmpdir(), 'agent-sessions-cmdpath-cwd-'))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
  await rm(emptyCwd, { recursive: true, force: true })
})

// 手算:命中结果的独立事实——返回值是绝对路径、指向该目录下该命令名、且 stat 为真实文件
async function expectHit(result: string | null, dir: string, fileName: string): Promise<void> {
  expect(result).not.toBeNull()
  expect(winPath.isAbsolute(result as string)).toBe(true)
  expect(basename(result as string).toLowerCase()).toBe(fileName.toLowerCase())
  expect((result as string).toLowerCase().startsWith(dir.toLowerCase())).toBe(true)
  const stats = await stat(result as string)
  expect(stats.isFile()).toBe(true)
}

it('PATH 含命中目录:返回该命令绝对路径(手算:文件落在注入目录内)', async () => {
  const bin = join(root, 'bin')
  await mkdir(bin)
  await writeFile(join(bin, 'fake-agent.cmd'), '@echo off\r\n', 'utf8')
  const result = await resolveCommandPath('fake-agent', {
    pathEnv: bin,
    exts: ['.CMD'],
    cwd: emptyCwd
  })
  await expectHit(result, bin, 'fake-agent.cmd')
})

it('PATH 无命中:返回 null(约定)', async () => {
  const bin = join(root, 'bin')
  await mkdir(bin) // 目录存在但没有该命令的任何候选文件
  const result = await resolveCommandPath('fake-agent', {
    pathEnv: bin,
    exts: ['.CMD'],
    cwd: emptyCwd
  })
  expect(result).toBeNull()
})

it('引号目录「"C:\\a b"」:剥引号后命中(构造反例:目录名含空格且 PATH 条目带双引号)', async () => {
  const bin = join(root, 'a b') // 目录名含空格——不剥引号则按原样打开目录必然失败
  await mkdir(bin)
  await writeFile(join(bin, 'fake-agent.cmd'), '@echo off\r\n', 'utf8')
  const result = await resolveCommandPath('fake-agent', {
    pathEnv: `"${bin}"`,
    exts: ['.CMD'],
    cwd: emptyCwd
  })
  await expectHit(result, bin, 'fake-agent.cmd')
})

it('PATHEXT 大小写混合:.EXE 与 .exe 等价命中(手算:Windows stat 与折叠名均不区分大小写)', async () => {
  const binLower = join(root, 'bin-lower')
  await mkdir(binLower)
  await writeFile(join(binLower, 'fake-agent.exe'), 'binary-ish', 'utf8')
  await expectHit(
    await resolveCommandPath('fake-agent', { pathEnv: binLower, exts: ['.EXE'], cwd: emptyCwd }),
    binLower,
    'fake-agent.exe'
  )

  const binUpper = join(root, 'bin-upper')
  await mkdir(binUpper)
  await writeFile(join(binUpper, 'fake-agent.EXE'), 'binary-ish', 'utf8')
  await expectHit(
    await resolveCommandPath('fake-agent', { pathEnv: binUpper, exts: ['.exe'], cwd: emptyCwd }),
    binUpper,
    'fake-agent.EXE'
  )
})

it('PATH 含不存在目录:跳过,返回 null 不崩(构造反例)', async () => {
  const missing = join(root, 'no-such-dir-as-t2') // 全程不创建
  const result = await resolveCommandPath('fake-agent', {
    pathEnv: missing,
    exts: ['.CMD'],
    cwd: emptyCwd
  })
  expect(result).toBeNull()
})

it('platform 注入 linux:POSIX 分支按裸名命中无扩展名文件(守卫:非 win32 扩展集不得回退 PATHEXT 语义)', async () => {
  // Why 不用 tmpdir():POSIX 分支按 ':' 切 PATH 且候选须 POSIX 绝对路径,Windows 盘符冒号会切断
  // 条目;夹具落在测试进程 cwd 所在盘(仓库 node_modules 缓存,gitignored),以「去盘符 + 正斜杠」
  // 的盘符相对 POSIX 形式注入,stat 按当前盘解析可达;POSIX 宿主上该变换为恒等,同样成立。
  const cacheBase = join(process.cwd(), 'node_modules', '.cache')
  await mkdir(cacheBase, { recursive: true })
  const bin = await mkdtemp(join(cacheBase, 'agent-sessions-cmdpath-posix-'))
  try {
    await writeFile(join(bin, 'claude'), '#!/bin/sh\n', 'utf8') // 裸名命令,无扩展名
    const binPosix = bin.replace(/^[A-Za-z]:/, '').replace(/\\/g, '/')
    const result = await resolveCommandPath('claude', {
      platform: 'linux',
      pathEnv: `${binPosix}:/usr/local/bin:/usr/bin`,
      cwd: emptyCwd
    })
    // 独立事实:返回字面量 basename 指向裸名、前缀指向注入目录,且 OS 以该字面量 stat 出真实文件
    expect(result).not.toBeNull()
    expect(basename(result as string)).toBe('claude')
    expect((result as string).startsWith(binPosix)).toBe(true)
    const stats = await stat(result as string)
    expect(stats.isFile()).toBe(true)
  } finally {
    await rm(bin, { recursive: true, force: true })
  }
})
