// hook 状态引擎(hook-run-state T1;spec 模块划分:main/agent-state/hook-tracker.ts)
// 输入 = agent hook 事件(agent 自己上报的权威事实)+ PTY 退出。判定:事件名查
// def.state.hooks 三槽 → 目标态**事实直落**——不经去抖,沿旧引擎 onExit 的 publish 模式
// (读屏时代的 300ms 去抖与安静门槛是为「偷看猜测」服务的,hook 事实不需要)。
// 创建即 seed idle(广播由编排层负责,沿 trackerForPty 的 {seed} 语义);exited 终态后
// 一切输入忽略;未知事件(不挂任何槽)静默忽略。同态幂等由 publish 早退保证:
// 广播数 = 真实变化数,重复事件不产生任何广播。
import type { AgentDefinition } from '../../shared/agents'
import type { SessionRunState } from '../../shared/types'

export interface HookTracker {
  onHookEvent(event: string): void
  onExit(): void
  state(): SessionRunState
  onChange(cb: (state: SessionRunState) => void): void
}

export function createHookTracker(def: AgentDefinition): HookTracker {
  const rules = def.state.hooks
  let state: SessionRunState = 'idle'
  // 终态标记:置位后一切输入(含迟到的 hook 事件)忽略
  let exited = false
  const listeners: Array<(state: SessionRunState) => void> = []

  // 事件 → 目标态;同一事件被声明进多个槽时按 working > waiting > idle 取先命中
  // (声明期不应重叠,运行期取先命中是确定性的兜底,不抛错)
  function targetOf(event: string): SessionRunState | null {
    if (rules.working.includes(event)) {
      return 'working'
    }
    if (rules.waiting.includes(event)) {
      return 'waiting'
    }
    if (rules.idle.includes(event)) {
      return 'idle'
    }
    return null
  }

  // 「只广播变化」的单一出处(沿旧引擎 publish 语义)
  function publish(next: SessionRunState): void {
    if (next === state) {
      return
    }
    state = next
    for (const listener of listeners) {
      listener(state)
    }
  }

  return {
    onHookEvent(event: string): void {
      if (exited) {
        return
      }
      const target = targetOf(event)
      if (target === null) {
        return
      }
      publish(target)
    },

    onExit(): void {
      if (exited) {
        return
      }
      exited = true
      publish('exited')
    },

    state: (): SessionRunState => state,

    onChange(cb: (state: SessionRunState) => void): void {
      listeners.push(cb)
    }
  }
}
