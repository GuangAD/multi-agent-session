// hook 注入器(hook-run-state T3):启动 reconcile / spawn 前自愈 / 项目删除联动 / 显式移除。
// 编排层(import fs + 注册表 + store,冒烟覆盖):策略全在 merge 接缝与模板,本文件只做
// 「按插件声明分发 → 读配置 → 调接缝 → 写回」。五家分发按 def.hooks.kind(ADR-0006:插件声明,
// 框架零改动消费);kimi 是全局注入(用户明示授权例外),与项目无关。
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { agentRegistry } from '../agents/agent-registry'
import { resolveCommandPath } from '../command-path/command-path-resolver'
import type { AgentDefinition } from '../../shared/agents'
import type { AppStore } from '../../shared/types'
import {
  buildHookCommand,
  generateForwarderScript,
  generateHookLauncherCmd,
  writeForwarderScript
} from './forwarder-script'
import {
  applyClaudeStyleHooks,
  removeClaudeStyleHooks,
  type ManagedHookEntry
} from './merge/claude-style-hooks'
import { applyAntigravityHooks, removeAntigravityHooks } from './merge/antigravity-hooks'
import { applyKimiToml, removeKimiToml } from './merge/kimi-toml'
import { generatePiExtension } from './pi-extension-template'

const PI_EXTENSION_FILE = 'soloport-state.ts'
const PI_TEMPLATE_MARKER = 'Managed by Soloport (hook-run-state)'

export interface Injector {
  /** 启动全量:脚本落盘 + 全部已添加项目 + kimi 全局 */
  reconcile(): Promise<void>
  /** spawn 前自愈:单个项目的配置快校验,缺则补(幂等,merge 接缝认领保证) */
  ensureProject(projectPath: string): Promise<void>
  /** 项目删除联动:摘该项目全部注入(用户内容保留;pi 文件仅删本应用模板) */
  removeProject(projectPath: string): void
  /** 显式移除(hooks:remove):全部项目 + kimi 全局 */
  removeAll(): void
}

export interface InjectorDeps {
  store: AppStore
  // userData/hook-scripts(受控路径;含空白时裸命令形态不成立 → 跳过注入并记录,已知边界)
  scriptsDir: string
  // kimi 全局配置根(缺省 os.homedir();测试注入)
  homeDir?: string
  // node 可执行路径(缺省 resolveCommandPath('node') → 'node' 裸名,交给 PATH)
  nodePath?: string
}

// 事件并集 → managed 条目(launcher 路径正斜杠化在 buildHookCommand 内完成)
function managedEntries(def: AgentDefinition, launcherPath: string): ManagedHookEntry[] {
  const { working, waiting, idle } = def.state.hooks
  const events = [...new Set([...working, ...waiting, ...idle])]
  return events.map((event) => ({ event, command: buildHookCommand(launcherPath, def.id, event) }))
}

export function createInjector(deps: InjectorDeps): Injector {
  const { store, scriptsDir } = deps
  const kimiConfigPath = (): string =>
    join(deps.homeDir ?? homedir(), '.kimi-code', 'config.toml')

  // 脚本落盘(forwarder.mjs + soloport-hook.cmd):幂等,内容随应用版本刷新。
  // 返回 launcher 命令路径(正斜杠);scriptsDir 含空白 → 返回 null(裸命令形态不成立,跳过注入)
  async function ensureScripts(): Promise<string | null> {
    if (/\s/.test(scriptsDir)) {
      console.error('[agent-hooks] scriptsDir 含空白,裸命令形态不成立,hook 注入跳过:', scriptsDir)
      return null
    }
    mkdirSync(scriptsDir, { recursive: true })
    const nodePath = deps.nodePath ?? (await resolveCommandPath('node')) ?? 'node'
    const forwarderPath = await writeForwarderScript(scriptsDir, generateForwarderScript())
    writeFileSync(join(scriptsDir, 'soloport-hook.cmd'), generateHookLauncherCmd(nodePath, forwarderPath))
    return join(scriptsDir, 'soloport-hook.cmd').replace(/\\/g, '/')
  }

  function pluginsWithKind(): AgentDefinition[] {
    return agentRegistry.list().filter((def) => def.hooks !== undefined)
  }

  function kimiDef(): AgentDefinition | undefined {
    return agentRegistry.list().find((def) => def.hooks?.kind === 'kimi-toml')
  }

  // 读配置(missing → 各家起始文本)+ 调接缝 + 变更才写回
  function mutateJsonFile(
    path: string,
    mutate: (text: string) => { text: string; changed: boolean },
    initialText = '{}\n'
  ): void {
    const text = existsSync(path) ? readFileSync(path, 'utf8') : initialText
    const result = mutate(text)
    if (!result.changed) {
      return
    }
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, result.text)
  }

  function ensureProjectWithLauncher(projectPath: string, launcherPath: string): void {
    for (const def of pluginsWithKind()) {
      const kind = def.hooks?.kind
      const entries = managedEntries(def, launcherPath)
      if (kind === 'claude-settings') {
        mutateJsonFile(join(projectPath, '.claude', 'settings.json'), (text) =>
          applyClaudeStyleHooks(text, entries)
        )
      } else if (kind === 'codex-json') {
        mutateJsonFile(join(projectPath, '.codex', 'hooks.json'), (text) =>
          applyClaudeStyleHooks(text, entries)
        )
      } else if (kind === 'antigravity-json') {
        mutateJsonFile(join(projectPath, '.agents', 'hooks.json'), (text) =>
          applyAntigravityHooks(text, entries)
        )
      } else if (kind === 'pi-extension') {
        // pi:扩展文件整写(带版本注释,reconcile 覆盖);应用外已有同名非本应用文件不覆盖
        const path = join(projectPath, '.pi', 'extensions', PI_EXTENSION_FILE)
        if (existsSync(path) && !readFileSync(path, 'utf8').includes(PI_TEMPLATE_MARKER)) {
          continue // 名字被用户占用:不动(冲突如实跳过,不抢文件)
        }
        mkdirSync(dirname(path), { recursive: true })
        writeFileSync(path, generatePiExtension(managedEntries(def, launcherPath).map((entry) => entry.event)))
      }
    }
  }

  function ensureKimi(launcherPath: string | null): void {
    const def = kimiDef()
    if (!def || launcherPath === null) {
      return
    }
    mutateJsonFile(kimiConfigPath(), (text) =>
      applyKimiToml(text, managedEntries(def, launcherPath)), ''
    )
  }

  function removeProjectWithLauncher(projectPath: string): void {
    for (const def of pluginsWithKind()) {
      const kind = def.hooks?.kind
      if (kind === 'claude-settings') {
        mutateJsonFile(join(projectPath, '.claude', 'settings.json'), removeClaudeStyleHooks, '{}\n')
      } else if (kind === 'codex-json') {
        mutateJsonFile(join(projectPath, '.codex', 'hooks.json'), removeClaudeStyleHooks, '{}\n')
      } else if (kind === 'antigravity-json') {
        mutateJsonFile(join(projectPath, '.agents', 'hooks.json'), removeAntigravityHooks, '{}\n')
      } else if (kind === 'pi-extension') {
        const path = join(projectPath, '.pi', 'extensions', PI_EXTENSION_FILE)
        if (existsSync(path) && readFileSync(path, 'utf8').includes(PI_TEMPLATE_MARKER)) {
          rmSync(path) // 仅删本应用模板,用户同名文件不动
        }
      }
    }
  }

  return {
    async reconcile(): Promise<void> {
      const launcherPath = await ensureScripts()
      for (const project of store.projects) {
        if (launcherPath !== null) {
          ensureProjectWithLauncher(project.path, launcherPath)
        }
      }
      ensureKimi(launcherPath)
    },

    async ensureProject(projectPath: string): Promise<void> {
      const launcherPath = await ensureScripts()
      if (launcherPath !== null) {
        ensureProjectWithLauncher(projectPath, launcherPath)
      }
    },

    removeProject(projectPath: string): void {
      removeProjectWithLauncher(projectPath)
    },

    removeAll(): void {
      for (const project of store.projects) {
        removeProjectWithLauncher(project.path)
      }
      const def = kimiDef()
      if (def) {
        mutateJsonFile(kimiConfigPath(), removeKimiToml, '')
      }
    }
  }
}
