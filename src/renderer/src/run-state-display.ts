// 运行状态的展示语义(单一来源):点色与中文文案(spec:working 绿 / waiting 橙 / idle 灰 / exited 红)
// 会话行状态点与标签页「已退出」标记共用此表,避免两处各写一份色值与文案
import type { SessionRunState } from '../../shared/types'

export interface RunStateDisplay {
  label: string
  dotClassName: string
}

export const RUN_STATE_DISPLAY: Record<SessionRunState, RunStateDisplay> = {
  working: { label: '工作中', dotClassName: 'bg-emerald-500' },
  waiting: { label: '等待输入', dotClassName: 'bg-amber-500' },
  idle: { label: '空闲', dotClassName: 'bg-zinc-400' },
  exited: { label: '已退出', dotClassName: 'bg-red-500' }
}
