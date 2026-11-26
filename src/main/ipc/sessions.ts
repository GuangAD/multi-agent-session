// sessions 域薄编排层:会话记录 CRUD 编排放这里——sessionRecords 改内存 store,
// 本层负责 agent 归一、组合落盘(防抖合并 + saveStoreAtomic + 退出前排空)与删除连带关标签页
// (spec 模块划分)
import { ipcMain } from 'electron'
import { rm, stat } from 'node:fs/promises'
import { IPC_CHANNELS } from './channels'
import { agentRegistry } from '../agents/agent-registry'
import { ptyRegistry } from '../pty-registry'
import { gitService } from '../git-service'
import { createWorktreeService, removeWorktree, type GitRunner } from '../git-worktree'
import { BackfillCoordinator } from '../session-store/backfill'
import { sessionRecords } from '../session-store/session-records'
import { activeSession } from '../active-session'
import { runImport } from '../session-store/session-import'
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

// 删除 worktree 前要看的事实之一:目录在不在(T3 处理 2)。探测失败一律当不存在,
// 剩下的交给 git 登记事实
async function pathExists(target: string): Promise<boolean> {
  try {
    await stat(target)
    return true
  } catch {
    return false
  }
}

// 返回退出前要 flush 的落盘器与防抖入口:scheduleSave 供入口转交给 ipc/pty.ts 的回填写回
// (controller 裁决 4:入口组合,ipc/pty 不跨域 import sessions 内部)
export function registerSessionsIpc(
  store: AppStore,
  storePath: string
): { flush: () => Promise<void>; scheduleSave: () => void } {
  const saver = createDebouncedSaver(store, storePath)
  const scheduleSave = saver.schedule
  // worktree 与 git 面板共用同一个 simple-git 实例与 root 缓存(spec 技术选型);
  // 每次调用新建服务,不缓存、不持有状态
  const runGit: GitRunner = (root, args) => gitService.for(root).raw(args)
  const worktreeService = createWorktreeService(runGit)

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
    async (
      _event,
      id: SessionId,
      options?: { forceWorktree?: boolean }
    ): Promise<{ closedTabs: SessionId[]; worktreeError?: string }> => {
      const session = sessionRecords.get(store, id)
      // 处理 1-5:带 worktree 的会话先清磁盘目录,再删记录——否则会留下「记录没了但目录还在」的孤儿。
      // 清不掉就把 git 原文回给渲染层,记录、回填资格、落盘一律不动,可带 forceWorktree 再来一次。
      // 「有活动标签页」在主进程侧 = 有存活 PTY,先读一次:下面可能主动把它杀掉,
      // 杀完之后它已不在活动列表里,但它的标签页仍然要关,故以这次读取为准。
      const activeIds = ptyRegistry.activeSessionIds()
      const wasActive = activeIds.includes(id)
      if (session?.worktree) {
        const project = store.projects.find((item) => item.id === session.projectId)
        if (project) {
          // Why 先杀 PTY:agent 的 shell cwd 就在 worktree 目录里,Windows 对「某进程的 cwd」加锁,
          // 实测 `git worktree remove` 会先摘掉登记再报 "failed to delete …: Permission denied",
          // 目录于是变成 `dirExists=true && registered=false` 的孤儿(应用再也定位不到)。
          // 删除意愿已明确,先停进程释放锁再清目录;清不掉(有未提交改动)仍按失败回原文。
          if (wasActive) {
            ptyRegistry.kill(id)
          }
          const worktreePath = session.worktree.path
          const cleanup = (): ReturnType<typeof removeWorktree> =>
            removeWorktree({
              root: project.path,
              path: worktreePath,
              force: options?.forceWorktree === true,
              service: worktreeService,
              dirExists: pathExists,
              removeDir: (target) => rm(target, { recursive: true, force: true })
            })
          let cleaned = await cleanup()
          if (!cleaned.ok && wasActive) {
            // ptyRegistry.kill 的树杀是并发的、不 await(约 0.6-0.9s 才真正释放目录锁),
            // 第一次常以 Permission denied 收场;等一会儿再试一次,有界两次。
            await new Promise((resolve) => setTimeout(resolve, 800))
            cleaned = await cleanup()
          }
          if (!cleaned.ok) {
            return { closedTabs: [], worktreeError: cleaned.error }
          }
        }
        // 项目记录不存在时拿不到仓库根(projects:remove 会连带删其下会话,这里只剩脏数据),
        // 无法执行 git,按普通会话删除——留目录好过留一条永远删不掉的记录
      }
      const existed = session !== undefined
      if (existed) {
        // 删除待回填会话也释放资格(controller 裁决 4);release 同时中止在途轮询,不写回
        BackfillCoordinator.release(id)
      }
      // 有活动标签页 = 有存活 PTY(与渲染层 tab 的进程存活判定同源)
      const result = sessionRecords.remove(store, id, activeIds)
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
    // lastOpenedAt 记最近打开时间;T8 续接参数由渲染层从返回的记录构造
    // (externalSessionId → pty:spawn 的可选 resume 字段透传,不另开通道)
    session.lastOpenedAt = new Date().toISOString()
    scheduleSave()
    return session
  })

  ipcMain.handle(IPC_CHANNELS.sessionsList, (_event, projectId: ProjectId): Session[] => {
    return sessionRecords.listByProject(store, projectId)
  })

  // T11:渲染层上报当前前台会话(切标签/关标签/窗口失焦都会上报);通知判定用它判断「用户正看着」
  ipcMain.handle(IPC_CHANNELS.sessionsSetActive, (_event, id: SessionId | null): void => {
    activeSession.set(id)
  })

  ipcMain.handle(
    IPC_CHANNELS.sessionsImport,
    async (
      _event,
      p: { projectId: ProjectId; agentId: AgentId }
    ): Promise<{ imported: number; skipped: number }> => {
      // 项目路径由主进程从 store 取(渲染层不传路径,避免与记录不一致)
      const project = store.projects.find((item) => item.id === p.projectId)
      if (!project) {
        throw new Error(`项目不存在:${p.projectId}`)
      }
      // T1 依赖反转:编排不查注册表——本层先归一别名、从插件取 scan 注入;无 scan 时 runImport 按 0 处理
      const def = agentRegistry.getById(p.agentId)
      if (!def) {
        throw new Error(`未知 agent:${p.agentId}`)
      }
      const result = await runImport(store, {
        projectId: project.id,
        agentId: def.id,
        agentName: def.name,
        projectPath: project.path,
        scan: def.sessions?.scan
      })
      if (result.imported > 0) {
        scheduleSave() // 导入只改内存 store,落盘仍走本层的防抖 + 原子写(T4 同款)
      }
      return result
    }
  )

  return { flush: saver.flush, scheduleSave: saver.schedule }
}
