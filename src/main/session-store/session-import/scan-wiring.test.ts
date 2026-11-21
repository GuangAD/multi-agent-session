// 接线守卫:定义 ↔ agentRegistry ↔ runImport 三方接线(评审 Minor-A)
// Why:run-import.test.ts 把 agentRegistry 整个打桩(它只验证 runImport 消费候选),
// 于是没有任何用例证明「真注册表里的定义挂了扫描器」。定义文件删掉一行 `scan:`,
// runImport 会静默返回 {imported:0},而既有用例全绿——本文件就是补这个盲区。
// 因此这里绝不 mock 注册表,也不 mock 扫描器:只读真表,问一句「扫描器在不在」。
// 真实扫描行为由 claude.test.ts / codex.test.ts / pi.test.ts / kimi.test.ts / antigravity.test.ts
// 各自回放 fixture 覆盖,本文件只管接线。
// T8 增补两类接线守卫:① 定义挂 resumeArgv(续接静默失效盲区);② 编排层
// scanNewOnly 套用 filterFreshCandidates(评审 Important-1:纯函数行为由 backfill.test.ts
// 直接断言,但 ipc/pty.ts 带 electron 依赖无法进单测,调用点被绕开时纯函数用例仍全绿,
// 这里按同一「接线守卫」定位对编排源码做静态断言)。
import { readFileSync } from 'node:fs'
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

  // T8 续接接线守卫(对称于上面的 scan 守卫):定义删掉一行 resumeArgv,重开链路会
  // 静默原样拉起(对话不续接),既有用例全绿——这里问一句「续接参数构造器在不在」。
  it('五家注册表定义都挂了 sessions.resumeArgv(不 mock 注册表;T8 接线守卫)', () => {
    for (const agentId of ['claude', 'codex', 'pi', 'kimi', 'antigravity'] as const) {
      expect(
        typeof agentRegistry.getById(agentId)?.sessions?.resumeArgv,
        `agentRegistry.getById('${agentId}').sessions.resumeArgv 不是函数:定义未挂续接参数,重开会原样拉起不续接`
      ).toBe('function')
    }
  })

  // Fix-1(评审 Important-1)接线守卫:回填编排的 scanNewOnly 必须真的套用候选新鲜度护栏。
  // 纯函数语义由 backfill.test.ts 直接断言,但 ipc/pty.ts 带 electron 依赖无法进单测——
  // 若编排调用点把 filterFreshCandidates 绕开(回到仅 known 集合过滤),从未导入的历史文件
  // 会被首扫误写回,而纯函数用例仍全绿。这里对编排源码做静态断言(读文本,不 import)。
  it('编排层 scanNewOnly 套用了 filterFreshCandidates(读 ipc/pty.ts 源码静态断言;T8 Fix-1 接线守卫)', () => {
    const source = readFileSync(new URL('../../ipc/pty.ts', import.meta.url), 'utf8')
    expect(
      source.includes('filterFreshCandidates('),
      'ipc/pty.ts 未调用 filterFreshCandidates:候选新鲜度护栏被绕开,从未导入的历史文件会被首扫误写回、重开续接到别的对话(评审 Important-1)'
    ).toBe(true)
  })
})
