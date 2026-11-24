// 接缝 claude-style-hooks 模块行为测试(契约 T3「测试规格」表 1-5 行;codex 表 6-7 行同函数覆盖)
// 期望值来源:brief 失败形态 1(用户配置无损)、T3 口径裁决(JSON 语义保留/认领幂等/fail-closed)
import { describe, expect, it } from 'vitest'
import {
  applyClaudeStyleHooks,
  removeClaudeStyleHooks
} from './claude-style-hooks'

const CMD = 'C:/Users/oberg/AppData/Roaming/Soloport/hook-scripts/soloport-hook.cmd --agent claude --event Stop'
const CMD2 = 'C:/Users/oberg/AppData/Roaming/Soloport/hook-scripts/soloport-hook.cmd --agent claude --event UserPromptSubmit'
const MANAGED = [
  { event: 'Stop', command: CMD },
  { event: 'UserPromptSubmit', command: CMD2 }
]

describe('applyClaudeStyleHooks', () => {
  it('1. 空对象 + managed 2 条 → hooks 两事件键各 1 条,command 含 launcher', () => {
    const result = applyClaudeStyleHooks('{}\n', MANAGED)
    expect(result.changed).toBe(true)
    const parsed = JSON.parse(result.text) as {
      hooks: Record<string, Array<{ hooks: Array<{ type: string; command: string; timeout: number }> }>>
    }
    expect(Object.keys(parsed.hooks).sort()).toEqual(['Stop', 'UserPromptSubmit'])
    expect(parsed.hooks['Stop']?.[0]?.hooks?.[0]).toEqual({ type: 'command', command: CMD, timeout: 10 })
  })

  it('2. 用户已有 hooks/permissions → 用户子树 deep-equal 保留,managed 追加不覆盖', () => {
    const userText = JSON.stringify(
      {
        permissions: { allow: ['mcp__demo'] },
        hooks: {
          Stop: [{ hooks: [{ type: 'command', command: 'my-own.cmd', timeout: 5 }] }]
        }
      },
      null,
      2
    ) + '\n'
    const result = applyClaudeStyleHooks(userText, MANAGED)
    const parsed = JSON.parse(result.text) as {
      permissions: unknown
      hooks: Record<string, Array<{ hooks: Array<{ command: string }> }>>
    }
    // 用户 permissions 与自有 Stop 条目语义保留(deep-equal)
    expect(parsed.permissions).toEqual({ allow: ['mcp__demo'] })
    const userEntries = parsed.hooks['Stop']?.[0]?.hooks?.filter((handler) => handler.command === 'my-own.cmd')
    expect(userEntries).toEqual([{ type: 'command', command: 'my-own.cmd', timeout: 5 }])
    // managed 条目在
    expect(JSON.stringify(parsed.hooks['Stop'])).toContain('soloport-hook.cmd')
  })

  it('3. 重复 apply 幂等(认领后替换,不重复插入)', () => {
    const first = applyClaudeStyleHooks('{}\n', MANAGED)
    const second = applyClaudeStyleHooks(first.text, MANAGED)
    expect(second.changed).toBe(false)
    expect(second.text).toBe(first.text)
    const parsed = JSON.parse(second.text) as { hooks: Record<string, unknown> }
    const stopGroups = parsed.hooks['Stop'] as unknown[]
    expect(stopGroups.length).toBe(1) // 只有一组(认领替换,不追加)
  })

  it('4. remove 仅摘 managed 条目,用户条目保留,空 hooks 键清理', () => {
    const applied = applyClaudeStyleHooks(
      JSON.stringify({ hooks: { Stop: [{ hooks: [{ type: 'command', command: 'mine.cmd' }] }] } }, null, 2) + '\n',
      MANAGED
    )
    const removed = removeClaudeStyleHooks(applied.text)
    expect(removed.changed).toBe(true)
    const parsed = JSON.parse(removed.text) as { hooks?: Record<string, unknown> }
    expect(JSON.stringify(parsed.hooks?.['Stop'])).toContain('mine.cmd')
    expect(JSON.stringify(parsed.hooks)).not.toContain('soloport-hook.cmd')
    // 再摘一次:幂等(changed=false)
    const again = removeClaudeStyleHooks(removed.text)
    expect(again.changed).toBe(false)
  })

  it('4b. 摘净后 hooks 键整体清理', () => {
    const applied = applyClaudeStyleHooks('{}\n', MANAGED)
    const removed = removeClaudeStyleHooks(applied.text)
    const parsed = JSON.parse(removed.text) as { hooks?: unknown }
    expect(parsed.hooks).toBeUndefined()
  })

  it('5. 坏 JSON 原样返回不抛错(fail-closed)', () => {
    const broken = '{"hooks": [半截'
    const result = applyClaudeStyleHooks(broken, MANAGED)
    expect(result.changed).toBe(false)
    expect(result.text).toBe(broken)
    expect(removeClaudeStyleHooks(broken).changed).toBe(false)
  })
})
