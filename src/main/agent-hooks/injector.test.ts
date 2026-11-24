// 注入器编排行为测试(契约 T3「测试规格」的行为面;编排层 import fs,接缝已全测,
// 本文件用真实 tmpdir 走「写 → 幂等 → 用户保留 → 摘除」全环,替代冒烟前的自动化护栏)
// 期望值来源:brief 失败形态 1/5 与 T3 口径(认领幂等/用户保留/pi 仅删本应用模板/kimi 字节保留)
import { afterEach, describe, expect, it } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createInjector, type Injector } from './injector'
import { HOOK_LAUNCHER_BASENAME } from './forwarder-script'
import type { AppStore } from '../../shared/types'
import '../agents/plugins' // 真实五插件清单(kind 分发的真实性来源)

const homes: string[] = []

function makeStore(projects: string[]): AppStore {
  return { projects: projects.map((path, i) => ({ id: `p-${i}`, path, name: 't' })), sessions: [], settings: {} } as unknown as AppStore
}

function makeInjector(projects: string[], home: string): Injector {
  return createInjector({
    store: makeStore(projects),
    scriptsDir: join(home, 'hook-scripts'),
    homeDir: home,
    nodePath: 'C:\\fake\\node.exe'
  })
}

afterEach(() => {
  for (const home of homes.splice(0)) {
    rmSync(home, { recursive: true, force: true })
  }
})

describe('injector', () => {
  it('12. ensureProject 在全新目录写齐四家注入文件,launcher/forwarder 落盘', async () => {
    const home = mkdtempSync(join(tmpdir(), 'hook-inj-'))
    homes.push(home)
    const project = join(home, 'proj-a')
    mkdirSync(project, { recursive: true })
    const injector = makeInjector([project], home)

    await injector.ensureProject(project)

    const claude = readFileSync(join(project, '.claude', 'settings.json'), 'utf8')
    expect(claude).toContain(HOOK_LAUNCHER_BASENAME)
    expect(claude).toContain('UserPromptSubmit')
    expect(claude).toContain('Stop')
    expect(existsSync(join(project, '.codex', 'hooks.json'))).toBe(true)
    expect(existsSync(join(project, '.agents', 'hooks.json'))).toBe(true)
    const piExt = readFileSync(join(project, '.pi', 'extensions', 'soloport-state.ts'), 'utf8')
    expect(piExt).toContain('Managed by Soloport')
    expect(piExt).toContain('agent_settled') // 事件清单来自 pi 插件 state.hooks 并集
    expect(existsSync(join(home, 'hook-scripts', 'forwarder.mjs'))).toBe(true)
    expect(existsSync(join(home, 'hook-scripts', HOOK_LAUNCHER_BASENAME))).toBe(true)
  })

  it('12b. 重复 ensureProject 幂等(文件字节不变)', async () => {
    const home = mkdtempSync(join(tmpdir(), 'hook-inj-'))
    homes.push(home)
    const project = join(home, 'proj-a')
    mkdirSync(project, { recursive: true })
    const injector = makeInjector([project], home)
    await injector.ensureProject(project)
    const before = readFileSync(join(project, '.claude', 'settings.json'), 'utf8')
    await injector.ensureProject(project)
    expect(readFileSync(join(project, '.claude', 'settings.json'), 'utf8')).toBe(before)
  })

  it('2i. 用户预置内容保留(preset hooks/permissions 深比较)', async () => {
    const home = mkdtempSync(join(tmpdir(), 'hook-inj-'))
    homes.push(home)
    const project = join(home, 'proj-a')
    const claudeDir = join(project, '.claude')
    mkdirSync(claudeDir, { recursive: true })
    const userText =
      JSON.stringify({ permissions: { allow: ['mcp__x'] }, hooks: { Stop: [{ hooks: [{ type: 'command', command: 'mine.cmd' }] }] } }, null, 2) + '\n'
    writeFileSync(join(claudeDir, 'settings.json'), userText)
    const injector = makeInjector([project], home)

    await injector.ensureProject(project)

    const parsed = JSON.parse(readFileSync(join(claudeDir, 'settings.json'), 'utf8')) as {
      permissions: unknown
      hooks: Record<string, Array<{ hooks: Array<{ command: string }> }>>
    }
    expect(parsed.permissions).toEqual({ allow: ['mcp__x'] })
    expect(parsed.hooks['Stop']?.[0]?.hooks?.some((handler) => handler.command === 'mine.cmd')).toBe(true)
  })

  it('13. removeProject 摘 managed 留用户,pi 模板文件删除', async () => {
    const home = mkdtempSync(join(tmpdir(), 'hook-inj-'))
    homes.push(home)
    const project = join(home, 'proj-a')
    mkdirSync(project, { recursive: true })
    const injector = makeInjector([project], home)
    await injector.ensureProject(project)

    injector.removeProject(project)

    const claude = readFileSync(join(project, '.claude', 'settings.json'), 'utf8')
    expect(claude).not.toContain(HOOK_LAUNCHER_BASENAME)
    expect(existsSync(join(project, '.pi', 'extensions', 'soloport-state.ts'))).toBe(false)
  })

  it('14. reconcile 写 kimi 全局 marker;removeAll 摘净;whitespace scriptsDir 整体跳过', async () => {
    const home = mkdtempSync(join(tmpdir(), 'hook-inj-'))
    homes.push(home)
    const project = join(home, 'proj-a')
    mkdirSync(project, { recursive: true })
    const injector = makeInjector([project], home)
    await injector.reconcile()

    const kimi = readFileSync(join(home, '.kimi-code', 'config.toml'), 'utf8')
    expect(kimi).toContain('>>> soloport-managed-kimi-hooks')

    injector.removeAll()
    expect(readFileSync(join(home, '.kimi-code', 'config.toml'), 'utf8')).not.toContain('soloport-managed-kimi-hooks')

    // 已知边界:scriptsDir 含空白 → 跳过注入(裸命令形态不成立),不写任何文件(用全新项目目录断言)
    const freshProject = join(home, 'proj-spaced')
    mkdirSync(freshProject, { recursive: true })
    const spaced = createInjector({
      store: makeStore([freshProject]),
      scriptsDir: join(home, 'hook scripts'),
      homeDir: home,
      nodePath: 'node'
    })
    await spaced.ensureProject(freshProject)
    expect(existsSync(join(freshProject, '.claude', 'settings.json'))).toBe(false)
  })
})
