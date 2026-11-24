// 接缝 antigravity-hooks / kimi-toml 模块行为测试(契约 T3「测试规格」表 6-7 / 8-11 行)
// 期望值来源:官方文档形状(.tmp 快照逐字段对照)/ marker 字节保留口径
import { describe, expect, it } from 'vitest'
import {
  ANTIGRAVITY_HOOK_NAME,
  applyAntigravityHooks,
  removeAntigravityHooks
} from './antigravity-hooks'
import {
  KIMI_MARKER_END,
  KIMI_MARKER_START,
  applyKimiToml,
  removeKimiToml
} from './kimi-toml'

const MANAGED = [
  { event: 'PreInvocation', command: 'C:/roam/hook-scripts/soloport-hook.cmd --agent antigravity --event PreInvocation' },
  { event: 'PostToolUse', command: 'C:/roam/hook-scripts/soloport-hook.cmd --agent antigravity --event PostToolUse' },
  { event: 'Stop', command: 'C:/roam/hook-scripts/soloport-hook.cmd --agent antigravity --event Stop' }
]

describe('applyAntigravityHooks(官方形状:hook 名映射)', () => {
  it('6. 空对象 + managed → soloport-state 键:工具事件带 matcher,其余直接 handler', () => {
    const result = applyAntigravityHooks('{}\n', MANAGED)
    expect(result.changed).toBe(true)
    const parsed = JSON.parse(result.text) as {
      'soloport-state': Record<string, unknown>
    }
    const entry = parsed[ANTIGRAVITY_HOOK_NAME]
    // PreInvocation/Stop = 直接 handler 列表(非工具事件)
    expect(entry['PreInvocation']).toEqual([
      { type: 'command', command: MANAGED[0]?.command, timeout: 10 }
    ])
    expect(entry['Stop']).toEqual([
      { type: 'command', command: MANAGED[2]?.command, timeout: 10 }
    ])
    // PostToolUse = 工具事件,matcher + hooks 包裹(官方形状)
    expect(entry['PostToolUse']).toEqual([
      { matcher: '*', hooks: [{ type: 'command', command: MANAGED[1]?.command, timeout: 10 }] }
    ])
  })

  it('7. 用户已有 hook 名保留;重复 apply 幂等;remove 只摘本应用键', () => {
    const userText = JSON.stringify({ 'user-hook': { Stop: [{ type: 'command', command: 'mine.sh' }] } }, null, 2) + '\n'
    const applied = applyAntigravityHooks(userText, MANAGED)
    const twice = applyAntigravityHooks(applied.text, MANAGED)
    expect(twice.changed).toBe(false)
    expect(twice.text).toBe(applied.text)
    const parsed = JSON.parse(applied.text) as Record<string, unknown>
    expect(parsed['user-hook']).toEqual({ Stop: [{ type: 'command', command: 'mine.sh' }] })
    const removed = removeAntigravityHooks(applied.text)
    const removedParsed = JSON.parse(removed.text) as Record<string, unknown>
    expect(removedParsed[ANTIGRAVITY_HOOK_NAME]).toBeUndefined()
    expect(removedParsed['user-hook']).toEqual({ Stop: [{ type: 'command', command: 'mine.sh' }] })
  })

  it('5k. 坏 JSON fail-closed', () => {
    expect(applyAntigravityHooks('半截', MANAGED).changed).toBe(false)
    expect(removeAntigravityHooks('半截').changed).toBe(false)
  })
})

describe('applyKimiToml(marker 块,字节保留口径)', () => {
  const USER_TOML = `# 用户自己的配置\r\nmodel = "kimi"\r\n\r\n[[hooks]]\nevent = 'SessionStart'\ncommand = 'mine.cmd'\n`
  const MANAGED = [
    { event: 'TurnStarted', command: 'C:/roam/hook-scripts/soloport-hook.cmd --agent kimi --event TurnStarted' },
    { event: 'Stop', command: 'C:/roam/hook-scripts/soloport-hook.cmd --agent kimi --event Stop' }
  ]

  it('8. 注入 marker 块:块外文本逐字节不动,块内含 managed 表', () => {
    const result = applyKimiToml(USER_TOML, MANAGED)
    expect(result.changed).toBe(true)
    expect(result.text).toContain(KIMI_MARKER_START)
    expect(result.text).toContain(KIMI_MARKER_END)
    expect(result.text).toContain("event = 'TurnStarted'")
    // 字节保留:用户前缀(含其自有 [[hooks]])原样在前
    expect(result.text.startsWith(USER_TOML)).toBe(true)
  })

  it('9. 重复 apply 幂等(区间整体替换)', () => {
    const first = applyKimiToml(USER_TOML, MANAGED)
    const second = applyKimiToml(first.text, MANAGED)
    expect(second.changed).toBe(false)
    expect(second.text).toBe(first.text)
  })

  it('10. remove 只删 marker 区间,用户前缀逐字节保留', () => {
    const applied = applyKimiToml(USER_TOML, MANAGED)
    const removed = removeKimiToml(applied.text)
    expect(removed.changed).toBe(true)
    expect(removed.text.startsWith(USER_TOML)).toBe(true)
    expect(removed.text).not.toContain(KIMI_MARKER_START)
    // 幂等
    expect(removeKimiToml(removed.text).changed).toBe(false)
  })

  it('11. 半截区间 fail-closed 不动', () => {
    const broken = USER_TOML + KIMI_MARKER_START + '\n[[hooks]]\n'
    expect(applyKimiToml(broken, MANAGED).changed).toBe(false)
    expect(removeKimiToml(broken).changed).toBe(false)
  })
})
