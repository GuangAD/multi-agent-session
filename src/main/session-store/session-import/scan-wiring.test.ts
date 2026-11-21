// 接线守卫:定义 ↔ agentRegistry ↔ runImport 三方接线(评审 Minor-A)
// Why:run-import.test.ts 把 agentRegistry 整个打桩(它只验证 runImport 消费候选),
// 于是没有任何用例证明「真注册表里的定义挂了扫描器」。定义文件删掉一行 `scan:`,
// runImport 会静默返回 {imported:0},而既有用例全绿——本文件就是补这个盲区。
// 因此这里绝不 mock 注册表,也不 mock 扫描器:只读真表,问一句「扫描器在不在」。
// 真实扫描行为由 claude.test.ts / codex.test.ts / pi.test.ts / kimi.test.ts / antigravity.test.ts
// 各自回放 fixture 覆盖,本文件只管接线。
import { describe, expect, it } from 'vitest'
import { agentRegistry } from '../../agents/agent-registry'

describe('导入扫描器接线', () => {
  // 一条用例覆盖两个 agent:接线是同一件事(定义里 sessions.scan 已注册),拆成两条只是重复;
  // 逐 id 断言 + 独立失败信息,漏接哪个 agent 由报错文案点出来。
  it('五家注册表定义都挂了 sessions.scan(不 mock 注册表)', () => {
    for (const agentId of ['claude', 'codex', 'pi', 'kimi', 'antigravity'] as const) {
      expect(
        typeof agentRegistry.getById(agentId)?.sessions?.scan,
        `agentRegistry.getById('${agentId}').sessions.scan 不是函数:定义未挂扫描器,导入会静默返回 {imported:0}`
      ).toBe('function')
    }
  })
})
