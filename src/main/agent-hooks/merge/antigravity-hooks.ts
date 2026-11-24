// antigravity .agents/hooks.json 合并接缝(hook-run-state T3):官方形状 = 顶层「hook 名 → 配置」,
// 配置含可选 enabled 与事件键;工具类事件(PreToolUse/PostToolUse)是 [{matcher, hooks:[…]}],
// 其余事件(PreInvocation/Stop 等)直接是 handler 数组(官方文档示例逐字段核对,.tmp 快照)。
// 认领 = 本应用固定 hook 名 'soloport-state'(名字认领,整键替换,天然幂等);
// 用户其他 hook 名原样保留(语义保留,同 claude-style 口径)。fail-closed 同前。
import type { ManagedHookEntry } from './claude-style-hooks'

export const ANTIGRAVITY_HOOK_NAME = 'soloport-state'
const TOOL_EVENTS = new Set(['PreToolUse', 'PostToolUse'])

interface Handler {
  type?: string
  command?: string
  timeout?: number
}

// 事件键 → 条目形状:工具事件包 matcher,其余直接 handler 列表(官方形状)
function eventEntries(event: string, command: string): unknown {
  const handler: Handler = { type: 'command', command, timeout: 10 }
  if (TOOL_EVENTS.has(event)) {
    return [{ matcher: '*', hooks: [handler] }]
  }
  return [handler]
}

export function applyAntigravityHooks(
  text: string,
  managed: ManagedHookEntry[]
): { text: string; changed: boolean } {
  let config: Record<string, unknown>
  try {
    const parsed: unknown = JSON.parse(text)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return { text, changed: false }
    }
    config = parsed as Record<string, unknown>
  } catch {
    return { text, changed: false }
  }
  const entry: Record<string, unknown> = {}
  for (const item of managed) {
    entry[item.event] = eventEntries(item.event, item.command)
  }
  config[ANTIGRAVITY_HOOK_NAME] = entry
  const output = JSON.stringify(config, null, 2) + '\n'
  return { text: output, changed: output !== text }
}

export function removeAntigravityHooks(text: string): { text: string; changed: boolean } {
  let config: Record<string, unknown>
  try {
    const parsed: unknown = JSON.parse(text)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return { text, changed: false }
    }
    config = parsed as Record<string, unknown>
  } catch {
    return { text, changed: false }
  }
  if (!(ANTIGRAVITY_HOOK_NAME in config)) {
    return { text, changed: false }
  }
  delete config[ANTIGRAVITY_HOOK_NAME]
  return { text: JSON.stringify(config, null, 2) + '\n', changed: true }
}
