// 接缝 stateTracker 模块行为测试(契约「测试规格」表格 11 条)
// 期望值来源(独立事实,不由被测引擎复算):
//   · 用例 1–6:Orca agent-state-rules 对应 json 的锚点 why(.reference/orca-1.4.265/src/main/runtime/agent-state-rules/)
//   · 用例 7–8:brief 第 5 节 kimi 降级预案
//   · 用例 9–10:本任务口径(退出为终态;同态 300ms 内不重复广播)
//   · 用例 11:fixture 里的人工标注序列
//   · 用例 12–13:本文件内构造的 bytes 分支定义(五家产品定义尚未填 bytes 规则,该分支无产品样本可回放)
// 时钟:全部用例用假时钟(vi.useFakeTimers),回放按 fixture 的 atMs 推进——去抖 300ms 与安静门槛
// 都靠 setSystemTime/advanceTimersByTime 驱动,不靠真实等待。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { agentRegistry } from '../agents/agent-registry'
import '../agents/plugins' // T1 插件化:注册表不自带清单,装载插件清单后 defOf 才取得到定义
import { createTracker, STATE_DEBOUNCE_MS, type Tracker, type TrackerOptions } from './state-parser'
import { antigravityFixture } from './__fixtures__/antigravity.fixture'
import { claudeFixture } from './__fixtures__/claude.fixture'
import { codexFixture } from './__fixtures__/codex.fixture'
import { kimiFixture } from './__fixtures__/kimi.fixture'
import { piFixture } from './__fixtures__/pi.fixture'
import type {
  AgentTrackerFixture,
  TrackerFixtureEvent,
  TrackerFixtureSample
} from './__fixtures__/tracker-fixture'
import type { AgentDefinition } from '../../shared/agents'
import type { SessionRunState } from '../../shared/types'

// 引擎 bytes 分支的测试本地定义:五家产品定义目前都没有填 bytes 规则(字节流是辅助源),这条分支
// 只能靠本文件内的构造定义钉住——不进 __fixtures__(fixture 目录是各 agent 的采样回放),也不改产品定义。
// 规则只留字节流 waiting 地标 + 安静门槛:地标本身必须覆盖「菜单持有键盘」的通用形状(这里借用 Orca
// codex.json plan_implement_menu 的文本,但归属是引擎分支样本,不是 codex 的产品规则)。
const BYTES_WAITING_DEF: AgentDefinition = {
  id: 'codex', // 仅满足 AgentId(开放为字符串,T1):引擎不查注册表,本定义只在用例内传给 createTracker
  name: 'bytes-branch 样本',
  command: 'bytes-branch',
  icon: 'B',
  color: 'test-only', // 契约必填字段(T1);引擎只读 state,值不参与判定
  state: {
    bytes: { working: [], waiting: ['implement this plan?'] },
    idleQuietMs: 2000
  }
}

function defOf(agentId: string): ReturnType<typeof agentRegistry.getById> {
  return agentRegistry.getById(agentId)
}

function feed(tracker: Tracker, event: TrackerFixtureEvent): void {
  switch (event.type) {
    case 'title':
      tracker.onTitle(event.title)
      return
    case 'snapshot':
      tracker.onSnapshot(event.text)
      return
    case 'bytes':
      tracker.onBytes(event.chunk)
      return
    case 'exit':
      tracker.onExit(event.code)
      return
  }
}

// 回放:按 atMs 合并事件与检查点推进假时钟;事件喂入追踪器,检查点读取 state()。
// 返回 "时刻:状态" 序列(与人工标注逐项比对,失败时能一眼看出是哪一刻偏了)
function replay(
  defId: string,
  sample: TrackerFixtureSample,
  options: TrackerOptions = {}
): { observed: string[]; broadcasts: SessionRunState[] } {
  const def = defOf(defId)
  if (!def) {
    throw new Error(`未知 agent:${defId}`)
  }
  const tracker = createTracker(def, options)
  const broadcasts: SessionRunState[] = []
  tracker.onChange((state) => broadcasts.push(state))

  const timeline = [
    ...sample.events.map((event) => ({ kind: 'event' as const, atMs: event.atMs, event })),
    ...sample.checkpoints.map((checkpoint) => ({
      kind: 'checkpoint' as const,
      atMs: checkpoint.atMs,
      checkpoint
    }))
  ].sort((a, b) => a.atMs - b.atMs || (a.kind === 'event' ? -1 : 1))

  const observed: string[] = []
  let clock = 0
  for (const step of timeline) {
    vi.advanceTimersByTime(step.atMs - clock)
    clock = step.atMs
    if (step.kind === 'event') {
      feed(tracker, step.event)
    } else {
      observed.push(`${step.atMs}:${tracker.state()}`)
    }
  }
  return { observed, broadcasts }
}

function expectedOf(sample: TrackerFixtureSample): string[] {
  return sample.checkpoints.map((checkpoint) => `${checkpoint.atMs}:${checkpoint.state}`)
}

function sampleOf(fixture: AgentTrackerFixture, name: string): TrackerFixtureSample {
  const sample = fixture.samples[name]
  if (!sample) {
    throw new Error(`fixture ${fixture.agentId} 缺少样本:${name}`)
  }
  if (!fixture.note) {
    throw new Error(`fixture ${fixture.agentId} 缺 note(样本性质与替换约定须写明)`)
  }
  return sample
}

function replaySample(fixture: AgentTrackerFixture, name: string): ReturnType<typeof replay> {
  const sample = sampleOf(fixture, name)
  return replay(fixture.agentId, sample, { quietMs: sample.quietMs })
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(0)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('stateTracker 三源判定(接缝 createTracker)', () => {
  it('1. claude 标题含 spinner 符号 → working(Orca claude.json idle_title_glyph)', () => {
    const { observed } = replaySample(claudeFixture, 'working-title')
    expect(observed).toEqual(expectedOf(sampleOf(claudeFixture, 'working-title')))
  })

  it('2. claude 纯标题(裸名)+ 静默达阈值 → idle(Orca claude.json idle_title #6011)', () => {
    const { observed } = replaySample(claudeFixture, 'plain-title-quiet')
    expect(observed).toEqual(expectedOf(sampleOf(claudeFixture, 'plain-title-quiet')))
  })

  it('3. pi 屏幕出现点阵帧 → working;帧消失 + 安静 → idle(pi 1.5.0 实证)', () => {
    const { observed: workingObserved } = replaySample(piFixture, 'working-screen')
    expect(workingObserved).toEqual(expectedOf(sampleOf(piFixture, 'working-screen')))

    const { observed: idleObserved } = replaySample(piFixture, 'idle-after-quiet')
    expect(idleObserved).toEqual(expectedOf(sampleOf(piFixture, 'idle-after-quiet')))
  })

  it('4. codex 屏幕含头部横幅 → working(Orca codex.json ready_header)', () => {
    const { observed } = replaySample(codexFixture, 'ready-header')
    expect(observed).toEqual(expectedOf(sampleOf(codexFixture, 'ready-header')))
  })

  it('5. codex 屏幕含确认菜单 → waiting(Orca codex.json plan_implement_menu)', () => {
    const { observed } = replaySample(codexFixture, 'plan-menu')
    expect(observed).toEqual(expectedOf(sampleOf(codexFixture, 'plan-menu')))
  })

  it('6. antigravity 屏幕含菜单地标 → waiting(Orca antigravity.json composer_ready + 就绪证伪扫描)', () => {
    const { observed } = replaySample(antigravityFixture, 'trust-menu')
    expect(observed).toEqual(expectedOf(sampleOf(antigravityFixture, 'trust-menu')))
  })

  it('7. kimi 任意输出(降级)→ working(brief 第 5 节降级预案)', () => {
    const { observed } = replaySample(kimiFixture, 'output-working')
    expect(observed).toEqual(expectedOf(sampleOf(kimiFixture, 'output-working')))
  })

  it('8. kimi 静默达阈值(降级)→ idle(brief 第 5 节降级预案)', () => {
    const { observed } = replaySample(kimiFixture, 'quiet-idle')
    expect(observed).toEqual(expectedOf(sampleOf(kimiFixture, 'quiet-idle')))
  })

  it('9. onExit → exited,此后任何输入不改变(退出为终态)', () => {
    const def = defOf('claude')!
    const tracker = createTracker(def)
    const broadcasts: SessionRunState[] = []
    tracker.onChange((state) => broadcasts.push(state))

    tracker.onTitle('⠋ Claude Code')
    vi.advanceTimersByTime(400)
    expect(tracker.state()).toBe('working')

    // 退出是事实不是判定:不经 300ms 去抖窗口,同步落地并广播(不推进定时器)
    tracker.onExit(0)
    expect(tracker.state(), 'onExit 后应立即为 exited,不依赖定时器').toBe('exited')
    expect(broadcasts.at(-1), '最后一次广播应是 exited').toBe('exited')
    vi.advanceTimersByTime(400)
    expect(tracker.state()).toBe('exited')

    // 终态:三源输入(含迟到上行)与再次 exit 都不得改变状态
    tracker.onTitle('⠙ Claude Code')
    tracker.onSnapshot('openai codex\nmodel: x\ndirectory: y')
    tracker.onBytes('more output\r\n')
    tracker.onExit(1)
    vi.advanceTimersByTime(5000)

    expect(tracker.state()).toBe('exited')
    expect(broadcasts, '退出后不得再广播任何状态').toEqual(['working', 'exited'])
  })

  it('10. 300ms 内连续标题抖动 → 状态不变(去抖,同态不重复广播)', () => {
    // 去抖是引擎行为,与具体 agent 无关,用 claude 的标题规则(干活=点阵 spinner、静止=✳)。
    // Why 不用 pi 做这条:pi 1.5.0 的标题不携带干活信号(definitions/pi.ts 的 Why),标题已无法
    // 表达 working↔idle 来回;pi 的干活信号在屏幕上,由用例 3 覆盖。
    const def = defOf('claude')!
    const tracker = createTracker(def)
    const broadcasts: SessionRunState[] = []
    tracker.onChange((state) => broadcasts.push(state))

    // 先确立 working
    tracker.onTitle('⠙ claude')
    vi.advanceTimersByTime(400)
    expect(tracker.state()).toBe('working')

    // 抖动:idle 标题后 100ms 内又回 working —— 去抖窗口内的反转不得落地
    vi.advanceTimersByTime(100) // t=500
    tracker.onTitle('✳ claude')
    vi.advanceTimersByTime(100) // t=600
    tracker.onTitle('⠙ claude')
    vi.advanceTimersByTime(400) // t=1000
    expect(tracker.state(), '窗口内抖动后状态应保持 working').toBe('working')
    expect(broadcasts).toEqual(['working'])

    // 抖动不能吞掉真实变化:稳定 idle 标题 300ms 后照样落地
    tracker.onTitle('✳ claude')
    vi.advanceTimersByTime(400)
    expect(tracker.state()).toBe('idle')
    expect(broadcasts).toEqual(['working', 'idle'])
  })

  it('11. 整段会话回放:状态序列与人工标注一致(pi session,人工标注)', () => {
    const { observed } = replaySample(piFixture, 'session')
    expect(observed).toEqual(expectedOf(sampleOf(piFixture, 'session')))
  })

  it('12. bytes.waiting 地标到达(被切成两个 chunk)→ waiting(引擎 bytes 分支)', () => {
    const tracker = createTracker(BYTES_WAITING_DEF)
    const broadcasts: SessionRunState[] = []
    tracker.onChange((state) => broadcasts.push(state))

    // 地标被一次 read 切成两段:靠跨 chunk 拼接才匹配得上
    tracker.onBytes('> 1. Yes, implement ')
    tracker.onBytes('this plan?\r\n')
    expect(tracker.state(), '去抖窗口内不落地').toBe('idle')
    vi.advanceTimersByTime(STATE_DEBOUNCE_MS)
    expect(tracker.state()).toBe('waiting')
    expect(broadcasts).toEqual(['waiting'])
  })

  it('13. bytes 证据只活到下一次快照:干净快照后不再 waiting,安静门槛到点回 idle', () => {
    const tracker = createTracker(BYTES_WAITING_DEF)
    const broadcasts: SessionRunState[] = []
    tracker.onChange((state) => broadcasts.push(state))

    tracker.onBytes('> 1. Yes, implement this plan?\r\n')
    vi.advanceTimersByTime(STATE_DEBOUNCE_MS) // t=300:waiting 落地
    expect(tracker.state()).toBe('waiting')

    // 用户点掉菜单后的画面:不含任何 waiting 地标 —— 快照清掉字节证据
    tracker.onSnapshot('│ >_ Demo CLI (v0.0.1)  │\r\n│ >                      │')
    // 手算:快照在 t=300 重置证据时刻,安静门槛 2000 → t=2300 判 idle,再去抖 300 → t=2600 落地
    vi.advanceTimersByTime(2000) // t=2300
    expect(tracker.state(), '安静门槛到点但去抖未走完').toBe('waiting')
    vi.advanceTimersByTime(STATE_DEBOUNCE_MS) // t=2600
    expect(tracker.state(), '快照已宣告字节证据过期,不得再粘在 waiting').toBe('idle')
    expect(broadcasts).toEqual(['waiting', 'idle'])
  })
})
