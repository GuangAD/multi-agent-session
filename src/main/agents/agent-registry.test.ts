// 接缝 agentRegistry 模块行为测试(契约「测试规格」第 1–5 条)
// 期望值来源:brief 第 5 节固定清单(claude/codex/agy/pi/kimi,kimi 别名 kimi-code)与手算;
// 直接调用注册表,不经 IPC。T1 插件化:注册表不再自带清单,import 插件清单装载真实注册表
//(新增 agent = 新增 plugins/<id>/ 插件包 + 清单一行)。
import { describe, expect, it } from 'vitest'
import { agentRegistry } from './agent-registry'
import './plugins'
import { claudePlugin } from './plugins/claude/plugin'

describe('agentRegistry', () => {
  it('固定清单:依次取 claude/codex/antigravity/pi/kimi,各返回对应定义且 id 一致(brief 第 5 节)', () => {
    // 手算:五家 id 与命令名一一对应(antigravity 的命令名是 agy)
    const wanted = [
      { id: 'claude', command: 'claude' },
      { id: 'codex', command: 'codex' },
      { id: 'antigravity', command: 'agy' },
      { id: 'pi', command: 'pi' },
      { id: 'kimi', command: 'kimi' }
    ] as const
    for (const { id, command } of wanted) {
      const def = agentRegistry.getById(id)
      expect(def, `getById(${id}) 应命中`).toBeDefined()
      expect(def?.id).toBe(id)
      expect(def?.command).toBe(command)
    }
  })

  it('getById(unknown) 返回 undefined,不抛错(约定)', () => {
    expect(() => agentRegistry.getById('unknown')).not.toThrow()
    expect(agentRegistry.getById('unknown')).toBeUndefined()
  })

  it('别名归一:getById(kimi-code) 返回 kimi 定义(brief 第 5 节)', () => {
    const def = agentRegistry.getById('kimi-code')
    expect(def).toBeDefined()
    expect(def?.id).toBe('kimi')
  })

  it('list() 返回 5 条,顺序与注册一致(手算:claude→codex→antigravity→pi→kimi)', () => {
    const list = agentRegistry.list()
    expect(list).toHaveLength(5)
    expect(list.map((def) => def.id)).toEqual(['claude', 'codex', 'antigravity', 'pi', 'kimi'])
  })

  it('register 注册重复 claude 抛错(约定)', () => {
    expect(() => agentRegistry.register([claudePlugin])).toThrow()
  })
})
