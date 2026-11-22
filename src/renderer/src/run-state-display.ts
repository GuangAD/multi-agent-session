// 运行状态的展示语义(单一来源):中文文案(spec:working 工作中 / waiting 等待输入 / idle 空闲 / exited 已退出)
// 会话行状态点已删除(T1),本表现仅由标签页「已退出」标记消费其 label
import type { SessionRunState } from '../../shared/types'

export interface RunStateDisplay {
  label: string
}

export const RUN_STATE_DISPLAY: Record<SessionRunState, RunStateDisplay> = {
  working: { label: '工作中' },
  waiting: { label: '等待输入' },
  idle: { label: '空闲' },
  exited: { label: '已退出' }
}
