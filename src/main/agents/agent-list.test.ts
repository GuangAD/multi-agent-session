// 接缝 agents:list 载荷形状测试(buildAgentListItem 纯函数;契约「测试规格」T1 第 4–5 条)
// 期望值来源:brief 第 5 节(icon 可选)+ 既有载荷口径(installed/path 透传、sessions 函数剥离)。
import { describe, expect, it } from 'vitest'
import { buildAgentListItem } from './agent-list'
import type { AgentDefinition } from '../../shared/agents'

// 无 icon、含 color 与 sessions 函数的定义形态(契约第 4 条的输入)
function makeDef(): AgentDefinition {
  return {
    id: 'claude',
    name: 'Claude Code',
    command: 'claude',
    color: '#d97757',
    state: {},
    sessions: {
      scan: async () => [],
      resumeArgv: (ref) => (ref.id ? ['--resume', ref.id] : null)
    }
  }
}

describe('buildAgentListItem', () => {
  it('4. 无 icon 定义 + installed/path 给定 → icon undefined、color 透传、sessions 剥离、其余透传', () => {
    const item = buildAgentListItem(makeDef(), true, 'D:\\tools\\claude.cmd')

    expect(item.def.icon).toBeUndefined()
    expect(item.def.color).toBe('#d97757')
    expect(item.def.sessions).toBeUndefined()
    expect(item.installed).toBe(true)
    expect(item.path).toBe('D:\\tools\\claude.cmd')
    // 剥离只摘 sessions,身份字段原样保留
    expect(item.def.id).toBe('claude')
    expect(item.def.name).toBe('Claude Code')
  })

  it('5. path 缺省 → 载荷里 path 为 undefined', () => {
    const item = buildAgentListItem(makeDef(), true)
    expect(item.path).toBeUndefined()
  })
})
