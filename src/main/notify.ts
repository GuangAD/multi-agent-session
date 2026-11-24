// 等输入/任务完成通知的判定接缝(T11 语义 + hook-run-state T5 增补:working→idle 也提醒,代表本次任务完成)
// 语义:后台会话才提醒——用户正看着该会话时不必打扰,进程结束(exited)不打扰,干活中(working)不提醒。
// 返回通知种类:null = 不发;'waiting' = 等输入;'done' = working→idle 任务完成。
// 纯函数,不碰 Electron:真实 Notification 的接线靠冒烟。
import type { SessionRunState } from '../shared/types'

export type NotifyKind = 'waiting' | 'done'

export interface NotifyInput {
  // 迁移前状态;null = 追踪器刚建立(无前态,不构成迁移,seed 路径天然不发)
  previous: SessionRunState | null
  state: SessionRunState
  // 该会话是否正在前台:标签页处于激活态且窗口聚焦(两者缺一都不算「用户正看着」)
  focused: boolean
}

export function shouldNotify(p: NotifyInput): NotifyKind | null {
  if (p.focused) {
    return null // 用户正看着:等待与完成都不必打扰
  }
  if (p.state === 'waiting') {
    return 'waiting' // 进入等待:需要用户决策
  }
  if (p.previous === 'working' && p.state === 'idle') {
    return 'done' // 任务完成:working 收口落 idle
  }
  return null
}
