// 运行状态切片(T5):runStates = 每会话的运行时状态('working' | 'waiting' | 'idle' | 'exited')
// 唯一来源 = 主进程 state:changed 广播(state-parser 去抖后的判定结果)。
// Why 不再复制一份到 TabSession:标签页生命周期('开着/关掉')由 tabs 表达,会话的「在干什么」
// 只有一个权威(状态引擎),两处各存一份必然打架——T4 的 TabSession.runState 因此在本任务收敛掉。
import type { StateCreator } from 'zustand'
import type { SessionId, SessionRunState } from '../../../shared/types'
import type { AppState } from './app-store'

export interface RunStateSlice {
  // 运行时状态,不持久化;缺项 = 尚未收到该会话的首次广播(渲染层不画点)
  runStates: Record<SessionId, SessionRunState>
  // 广播落地:按会话覆盖(单键写入,其余会话的状态不动)
  setRunState: (sessionId: SessionId, state: SessionRunState) => void
}

export const createRunStateSlice: StateCreator<AppState, [], [], RunStateSlice> = (set) => ({
  runStates: {},

  setRunState: (sessionId, state) => {
    set((prev) => ({ runStates: { ...prev.runStates, [sessionId]: state } }))
  }
})
