// 状态追踪器 fixture 形状:事件序列 + 人工标注的状态检查点(spec 覆盖标准「接缝 stateTracker」)
// 期望值来源必须是独立事实(Orca agent-state-rules 对应 json 的锚点 why / 约定 / 人工标注),不得由被测
// 引擎的算法复算——故 fixture 只写「某时刻应为某状态」,回放由 state-parser.test.ts 完成。
import type { AgentId, SessionRunState } from '../../../shared/types'

// 三源输入 + 退出事件;atMs = 假时钟上的绝对时刻(回放按此推进时钟,定时器随之触发)
export type TrackerFixtureEvent =
  | { type: 'title'; atMs: number; title: string }
  | { type: 'snapshot'; atMs: number; text: string }
  | { type: 'bytes'; atMs: number; chunk: string }
  | { type: 'exit'; atMs: number; code: number }

export interface TrackerFixtureCheckpoint {
  atMs: number
  state: SessionRunState
}

export interface TrackerFixtureSample {
  // 期望值来源锚点(Orca json 的 id + why 摘要,或「约定」/「人工标注」)
  source: string
  // 覆盖定义的安静门槛(AgentStateRules.idleQuietMs);缺省用定义值
  quietMs?: number
  events: TrackerFixtureEvent[]
  checkpoints: TrackerFixtureCheckpoint[]
}

export interface AgentTrackerFixture {
  agentId: AgentId
  // 样本性质与替换约定:真实采样(AGENT_SESSIONS_SAMPLE)到位前的构造样本须在此写明
  note: string
  samples: Record<string, TrackerFixtureSample>
}
