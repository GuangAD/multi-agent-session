// 会话记录 CRUD(接缝 sessionRecords):只改传入 store 的 sessions 段,不碰 fs
// 落盘由 IPC 层编排(ipc/sessions.ts 的防抖保存器 + saveStoreAtomic);本模块保持纯内存变更,
// Why: 接缝只测内存状态变化,fs 事务归 storePersistence,IPC 层负责把两者串起来(spec 模块划分)。
import { randomUUID } from 'node:crypto'
import type {
  AgentId,
  AppStore,
  ProjectId,
  Session,
  SessionId,
  SessionWorktree
} from '../../shared/types'

export const sessionRecords = {
  // 副作用与重入:原地追加进 store.sessions;id 用 uuid(全局唯一)
  // worktree 三项原样写入、不做校验(已由 git-worktree 层验过);缺省 = 普通会话
  create(
    store: AppStore,
    p: {
      projectId: ProjectId
      agentId: AgentId
      worktree?: SessionWorktree
    }
  ): Session {
    const session: Session = {
      id: randomUUID(),
      projectId: p.projectId,
      agentId: p.agentId,
      // 默认显示名取规范 agent id;agent 显示名(def.name)由 IPC 组合层补,session-records 不横向依赖 agents 域
      title: p.agentId,
      createdAt: new Date().toISOString(),
      origin: 'created',
      ...(p.worktree ? { worktree: p.worktree } : {})
    }
    store.sessions.push(session)
    return session
  },

  // 只改 title,其余字段一个不动(brief 第 5 节:重命名只改应用侧显示名)
  rename(store: AppStore, p: { id: SessionId; title: string }): void {
    const session = store.sessions.find((item) => item.id === p.id)
    if (!session) {
      return // 未知 id 静默忽略(删除与重命名的竞态由调用方顺序兜住,不抛错)
    }
    session.title = p.title
  },

  // 记录移除;若该记录有活动标签页,返回需关闭的标签页 id(关 tab 编排由 IPC 层做)
  remove(store: AppStore, id: SessionId, activeTabs: SessionId[]): { closedTabs: SessionId[] } {
    const before = store.sessions.length
    store.sessions = store.sessions.filter((session) => session.id !== id)
    if (store.sessions.length === before) {
      return { closedTabs: [] } // 无记录可删:不连带关标签页
    }
    return { closedTabs: activeTabs.includes(id) ? [id] : [] }
  },

  // 过滤 + createdAt 倒序(新创建在前)
  listByProject(store: AppStore, projectId: ProjectId): Session[] {
    return store.sessions
      .filter((session) => session.projectId === projectId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  },

  get(store: AppStore, id: SessionId): Session | undefined {
    return store.sessions.find((session) => session.id === id)
  },

  // 按项目批量移除:删除项目时连带删其下会话记录(2026-11-21 变更,根治孤儿记录),
  // 返回被移除的 id 供 IPC 层连带关闭标签页;未知项目 = 空操作
  removeByProject(store: AppStore, projectId: ProjectId): SessionId[] {
    const removed = store.sessions.filter((session) => session.projectId === projectId)
    if (removed.length === 0) {
      return []
    }
    const removedIds = new Set(removed.map((session) => session.id))
    store.sessions = store.sessions.filter((session) => !removedIds.has(session.id))
    return removed.map((session) => session.id)
  }
}
