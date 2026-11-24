// claude / codex 共用的 hooks 合并接缝(hook-run-state T3):两者配置形状同构——
// { hooks?: { <Event>: [{ matcher?, hooks: [{ type:'command', command, timeout? }] }] } }
// (claude 在 settings.json 的顶层 hooks 键;codex 在 hooks.json 顶层 hooks 键,另有可选 description)。
// 认领制:managed 条目 command 含 launcher 文件名稳定子串(HOOK_LAUNCHER_BASENAME)即本应用条目;
// 重复 reconcile 先认领后插(幂等);remove 只摘认领条目。用户已有条目「语义保留」硬断言:
// parse 后用户子树 deep-equal(JSON 重序列化不改键值,不做字节级文本保真——口径裁决见 T3 契约)。
// fail-closed:文本非合法 JSON → 原样返回不动(changed=false)。
import { HOOK_LAUNCHER_BASENAME } from '../forwarder-script'

export interface ManagedHookEntry {
  event: string
  command: string
}

interface HookHandler {
  type?: string
  command?: string
  timeout?: number
}

interface HookGroup {
  matcher?: string
  hooks?: HookHandler[]
}

interface ClaudeStyleConfig {
  hooks?: Record<string, HookGroup[]> | unknown
  [key: string]: unknown
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

// 事件组内摘除本应用条目(认领);返回是否发生变化;非数组输入归一为空组
function stripClaimed(groups: unknown): { groups: HookGroup[]; changed: boolean } {
  if (!Array.isArray(groups)) {
    return { groups: [], changed: false }
  }
  let changed = false
  const kept: HookGroup[] = []
  for (const group of groups as HookGroup[]) {
    if (!isObject(group) || !Array.isArray(group.hooks)) {
      kept.push(group as HookGroup)
      continue
    }
    const handlers = (group.hooks as HookHandler[]).filter(
      (handler) => !(isObject(handler) && typeof handler.command === 'string' && handler.command.includes(HOOK_LAUNCHER_BASENAME))
    )
    if (handlers.length !== (group.hooks as unknown[]).length) {
      changed = true
    }
    if (handlers.length > 0) {
      kept.push({ ...group, hooks: handlers })
    }
  }
  return { groups: kept, changed }
}

// 写入 managed 条目:先认领摘旧,再按事件追加(幂等:认领后替换,不重复插入)
export function applyClaudeStyleHooks(
  text: string,
  managed: ManagedHookEntry[]
): { text: string; changed: boolean } {
  let config: ClaudeStyleConfig
  try {
    const parsed: unknown = JSON.parse(text)
    if (!isObject(parsed)) {
      return { text, changed: false }
    }
    config = parsed as ClaudeStyleConfig
  } catch {
    return { text, changed: false } // fail-closed:非合法 JSON 不动
  }
  if (!isObject(config.hooks)) {
    config.hooks = {}
  }
  const hooks = config.hooks as Record<string, HookGroup[]>
  for (const entry of managed) {
    const stripped = stripClaimed(hooks[entry.event])
    hooks[entry.event] = [
      ...(stripped.groups as HookGroup[]),
      { hooks: [{ type: 'command', command: entry.command, timeout: 10 }] }
    ]
  }
  const output = JSON.stringify(config, null, 2) + '\n'
  return { text: output, changed: output !== text }
}

// 摘除 managed 条目:事件组清空则删组,事件键清空则删键,hooks 键空则删键
export function removeClaudeStyleHooks(text: string): { text: string; changed: boolean } {
  let config: ClaudeStyleConfig
  try {
    const parsed: unknown = JSON.parse(text)
    if (!isObject(parsed)) {
      return { text, changed: false }
    }
    config = parsed as ClaudeStyleConfig
  } catch {
    return { text, changed: false }
  }
  if (!isObject(config.hooks)) {
    return { text, changed: false }
  }
  const hooks = config.hooks as Record<string, HookGroup[]>
  let changed = false
  for (const event of Object.keys(hooks)) {
    const stripped = stripClaimed(hooks[event])
    if (stripped.changed) {
      changed = true
    }
    if ((stripped.groups as unknown[]).length === 0) {
      delete hooks[event]
    } else {
      hooks[event] = stripped.groups as HookGroup[]
    }
  }
  if (Object.keys(hooks).length === 0) {
    delete config.hooks
  }
  if (!changed) {
    return { text, changed: false }
  }
  return { text: JSON.stringify(config, null, 2) + '\n', changed: true }
}
