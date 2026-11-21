// 等输入通知的判定(T11;spec 覆盖标准「接缝 shouldNotify」)
// 语义:后台会话进入 waiting 才提醒——用户正看着该会话时不必打扰,进程结束(exited)不打扰,
// 干活中(working)也不必提醒。真正弹通知的接线在 ipc/state.ts(需要窗口与通知 API)。
import type { SessionRunState } from '../shared/types'

export interface NotifyInput {
  state: SessionRunState
  // 该会话是否正在前台:标签页处于激活态且窗口聚焦(两者缺一都不算「用户正看着」)
  focused: boolean
}

export function shouldNotify(p: NotifyInput): boolean {
  return p.state === 'waiting' && !p.focused
}
