// 当前前台会话(T11):渲染层报告的「用户正看着哪个标签页」。
// Why 独立小模块:写入方在 sessions IPC(渲染层上报),读取方在 state IPC(通知判定),
// 两者分属不同域,按 spec「领域模块之间禁止横向 import」不能互相调用,故用共享的状态持有者
// (与 ptyRegistry 的 activeSessionIds 同理:主进程内的运行期状态,不进 store.json)。
import type { SessionId } from '../shared/types'

let activeSessionId: SessionId | null = null

export const activeSession = {
  get(): SessionId | null {
    return activeSessionId
  },
  // 未知/空值一律视为「没有前台会话」:窗口刚启动、标签全关时都属于这种情况
  set(id: SessionId | null): void {
    activeSessionId = id
  }
}
