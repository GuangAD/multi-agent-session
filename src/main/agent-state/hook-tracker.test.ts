// 接缝 hook-tracker 模块行为测试(契约 T1「测试规格」表 9 条)
// 期望值来源(独立事实,不由被测引擎复算):
//   · 用例 1–5:__fixtures__/hook-fixtures.ts(各家官方 hooks 文档语义,锚点见 fixture source)
//   · 用例 6–9:本任务口径(同态幂等 / exited 终态 / seed idle / 未知事件容错)
// 无时钟依赖:hook 事实直落,无去抖与安静门槛,不需要假时钟。
import { describe, expect, it } from 'vitest'
import { agentRegistry } from '../agents/agent-registry'
import '../agents/plugins' // 注册表不自带清单:装载插件清单后 defOf 才取得到定义
import { createHookTracker, type HookTracker } from './hook-tracker'
import { hookFixtures, type AgentHookFixture } from './__fixtures__/hook-fixtures'
import type { AgentDefinition } from '../../shared/agents'

function defOf(agentId: string): AgentDefinition {
  const def = agentRegistry.getById(agentId)
  if (!def) {
    throw new Error(`插件清单未登记 agent:${agentId}`)
  }
  return def
}

// 回放一个样本:逐步喂事件、断言状态;返回广播数(供幂等断言)
function replaySample(tracker: HookTracker, steps: { event: string; expect: null | string }[]): number {
  let broadcasts = 0
  tracker.onChange(() => {
    broadcasts += 1
  })
  let changes = 0
  for (const step of steps) {
    const before = tracker.state()
    tracker.onHookEvent(step.event)
    if (step.expect === null) {
      expect(tracker.state()).toBe(before) // 不产生变化(同态幂等或未知事件)
    } else {
      expect(tracker.state()).toBe(step.expect)
      changes += 1
    }
  }
  expect(broadcasts).toBe(changes) // 广播数 = 真实变化数(「只广播变化」单一出处)
  return broadcasts
}

describe('hook-tracker', () => {
  // 用例 1–5:五家 fixture 回放
  for (const fixture of hookFixtures as AgentHookFixture[]) {
    describe(fixture.agentId, () => {
      for (const [name, sample] of Object.entries(fixture.samples)) {
        it(`${name}`, () => {
          const tracker = createHookTracker(defOf(fixture.agentId))
          expect(tracker.state()).toBe('idle') // seed
          replaySample(tracker, sample.steps)
        })
      }
    })
  }

  // 用例 6:同态幂等——同一事件重复喂,只广播一次
  it('6. 同态重复事件只广播一次(幂等)', () => {
    const tracker = createHookTracker(defOf('claude'))
    let broadcasts = 0
    tracker.onChange(() => {
      broadcasts += 1
    })
    tracker.onHookEvent('UserPromptSubmit')
    tracker.onHookEvent('UserPromptSubmit')
    tracker.onHookEvent('UserPromptSubmit')
    expect(tracker.state()).toBe('working')
    expect(broadcasts).toBe(1)
  })

  // 用例 7:exited 是终态——退出后的 hook 事件被忽略,状态不再翻回
  it('7. onExit 后 hook 事件忽略,保持 exited', () => {
    const tracker = createHookTracker(defOf('claude'))
    let broadcasts = 0
    tracker.onChange(() => {
      broadcasts += 1
    })
    tracker.onHookEvent('UserPromptSubmit')
    expect(tracker.state()).toBe('working')
    tracker.onExit()
    expect(tracker.state()).toBe('exited')
    const after = broadcasts
    tracker.onHookEvent('Stop')
    expect(tracker.state()).toBe('exited') // 不被翻回 idle
    expect(broadcasts).toBe(after) // 无新广播
  })

  // 用例 8:创建即 seed idle(广播由编排层负责,引擎只暴露状态)
  it('8. 创建即 idle', () => {
    const tracker = createHookTracker(defOf('codex'))
    expect(tracker.state()).toBe('idle')
  })

  // 用例 9:未知事件(不挂任何槽)静默忽略,不广播不抛错
  it('9. 未知事件静默忽略', () => {
    const tracker = createHookTracker(defOf('claude'))
    let broadcasts = 0
    tracker.onChange(() => {
      broadcasts += 1
    })
    expect(() => tracker.onHookEvent('NotARealEvent')).not.toThrow()
    expect(tracker.state()).toBe('idle')
    expect(broadcasts).toBe(0)
  })
})
