// 侧栏会话列表的展示顺序与折叠阈值(T6 接线:列表按 activityAt 倒序,超一屏折叠)
// 排序只发生在渲染层展示路径上:session-records/runImport 都只负责写入,顺序由这里统一决定。
import type { Session } from '../../shared/types'

// 一屏能放下的会话行数;超出的默认折叠,点「显示更多」展开(plan M4)
export const SESSION_LIST_COLLAPSED_LIMIT = 8

/** 最近活动倒序:导入会话按 activityAt(agent 侧最后活动时间),自建会话退回 createdAt */
export function orderSessionsForDisplay(sessions: Session[]): Session[] {
  return [...sessions].sort((left, right) => activityOf(right).localeCompare(activityOf(left)))
}

function activityOf(session: Session): string {
  return session.activityAt ?? session.createdAt
}
