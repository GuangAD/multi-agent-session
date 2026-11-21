// sessions 域薄编排层:会话记录 CRUD 编排放这里——sessionRecords 改内存 store,
// 本层负责 agent 归一、组合落盘(防抖合并 + saveStoreAtomic + 退出前排空)与删除连带关标签页
// (spec 模块划分)
import { ipcMain } from 'electron'
import { IPC_CHANNELS } from './channels'
import { agentRegistry } from '../agents/agent-registry'
import { ptyRegistry } from '../pty-registry'
import { sessionRecords } from '../session-store/session-records'
import { saveStoreAtomic } from '../session-store/store-persistence'
import type { AgentId, AppStore, ProjectId, Session, SessionId } from '../../shared/types'

// 防抖窗口:短时间内成串的变更(新建/重命名/删除/重开)合并为一次整文件原子写
// Why: store 是同一内存对象,延迟写发布的必然是写时刻的最新状态,合并天然安全;整文件写 + rename
// 每次都做纯浪费(plan 附录 A4:projects.json 小,整文件防抖 + 原子写)。
const SAVE_DEBOUNCE_MS = 100

// 落盘失败不向渲染层抛(操作已生效于内存);如实记录,下次变更会再写一次
function writeStore(store: AppStore, storePath: string): Promise<void> {
  return saveStoreAtomic(storePath, store).catch((error) => {
    console.error('会话记录落盘失败:', error)
  })
}

// schedule = 记一次待写变更并重置尾沿计时;flush = 立即写出待写变更(退出前调用)
// Why: 防抖窗口内退出应用会丢掉最后一次变更(重启后已删会话复活、重命名回退),退出路径
// 需要能主动排空;dirty 标记保证「无待写变更时 flush 不写」,避免关闭应用白写一次整文件。
function createDebouncedSaver(
  store: AppStore,
  storePath: string
): { schedule: () => void; flush: () => Promise<void> } {
  let timer: ReturnType<typeof setTimeout> | null = null
  let dirty = false
  // 已发出写的队尾:flush 既写出待写变更,也等飞行中的那次写真正落盘
  // Why: 定时器触发后的写是异步的,退出只等「待写标记」会在写进行中提前放行,最后一次变更照样丢
  let writing: Promise<void> = Promise.resolve()

  function writeIfPending(): Promise<void> {
    if (!dirty) {
      return writing // 无待写变更:不做无谓整文件写,只等已在飞行的那次
    }
    dirty = false // 先清标记再写:写期间的变更由下一轮 schedule 重新置脏
    writing = writing.then(() => writeStore(store, storePath))
    return writing
  }

  return {
    schedule() {
      dirty = true
      if (timer) {
        clearTimeout(timer)
      }
      timer = setTimeout(() => {
        timer = null
        void writeIfPending()
      }, SAVE_DEBOUNCE_MS)
    },
    async flush() {
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
      await writeIfPending()
    }
  }
}

// 返回退出前要 flush 的落盘器:防抖编排归 IPC 层,入口(index.ts)不碰防抖细节
export function registerSessionsIpc(
  store: AppStore,
  storePath: string
): { flush: () => Promise<void> } {
  const saver = createDebouncedSaver(store, storePath)
  const scheduleSave = saver.schedule

  ipcMain.handle(
    IPC_CHANNELS.sessionsCreate,
    (_event, p: { projectId: ProjectId; agentId: AgentId }): Session => {
      // agentId 支持别名(kimi-code),归一后落规范 id
      const def = agentRegistry.getById(p.agentId)
      if (!def) {
        throw new Error(`未知 agent:${p.agentId}`)
      }
      const session = sessionRecords.create(store, { projectId: p.projectId, agentId: def.id })
      // 默认显示名取 agent 显示名:组合点在 IPC 层——session-records 不横向依赖 agents 域(spec 依赖方向)
      sessionRecords.rename(store, { id: session.id, title: def.name })
      scheduleSave()
      return session
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.sessionsRename,
    (_event, p: { id: SessionId; title: string }): void => {
      if (!sessionRecords.get(store, p.id)) {
        return // 未知 id 静默忽略(与删除并存时是正常竞态)
      }
      sessionRecords.rename(store, p)
      scheduleSave()
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.sessionsRemove,
    (_event, id: SessionId): { closedTabs: SessionId[] } => {
      const existed = sessionRecords.get(store, id) !== undefined
      // 「有活动标签页」在主进程侧 = 有存活 PTY(与渲染层 tab 的进程存活判定同源)
      const result = sessionRecords.remove(store, id, ptyRegistry.activeSessionIds())
      if (existed) {
        scheduleSave() // 无记录可删时不落盘(重复删除是正常竞态)
      }
      return result
    }
  )

  ipcMain.handle(IPC_CHANNELS.sessionsOpen, (_event, id: SessionId): Session => {
    const session = sessionRecords.get(store, id)
    if (!session) {
      throw new Error(`会话不存在:${id}`)
    }
    // T4 重开 = 原样拉起;lastOpenedAt 记最近打开时间(resume 参数由 T8 的会话续接接入)
    session.lastOpenedAt = new Date().toISOString()
    scheduleSave()
    return session
  })

  ipcMain.handle(IPC_CHANNELS.sessionsList, (_event, projectId: ProjectId): Session[] => {
    return sessionRecords.listByProject(store, projectId)
  })

  return { flush: saver.flush }
}
