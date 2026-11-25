// pty 域薄编排层:spawn/write/resize/kill 透传注册表;data/exit 事件推渲染层
// (样板同 ipc/projects.ts;窗口经注入的取窗函数拿,便于单窗口应用跟随重建)
// T8 增补:spawn 载荷可选 resume(重开续接)、spawn 成功后自动 claim 回填资格并轮询、
// kill 时释放资格。store 与落盘回调由入口装配处注入(controller 裁决 4:不跨域 import,
// scheduleSave 来自 registerSessionsIpc 的防抖保存器)。
import { ipcMain, type BrowserWindow } from 'electron'
import { statSync } from 'node:fs'
import { IPC_CHANNELS } from './channels'
import { ptyRegistry } from '../pty-registry'
import { createPtyDataCoalescer } from '../pty-data-coalescer'
import { agentRegistry } from '../agents/agent-registry'
import {
  BackfillCoordinator,
  filterFreshCandidates,
  pickBackfillTitle
} from '../session-store/backfill'
import { sessionRecords } from '../session-store/session-records'
import { getReceiverInfo } from '../agent-hooks/receiver'
import type { Injector } from '../agent-hooks/injector'
import type { AgentDefinition, ImportCandidate, ResumeRef } from '../../shared/agents'
import type { AppStore, AgentId, Session, SessionId } from '../../shared/types'
import type { PtyDataEvent, PtyExitEvent } from '../../shared/ipc-contract'

// T3 合并转发档位(brief 第 5 节:16ms 窗口或 64KB 先到先发;64KB = 字符数)
const PTY_DATA_COALESCE_WINDOW_MS = 16
const PTY_DATA_COALESCE_MAX_CHARS = 64 * 1024

function sendToRenderer(
  getWindow: () => BrowserWindow | null,
  channel: string,
  payload: PtyDataEvent | PtyExitEvent | Session
): void {
  const window = getWindow()
  if (window && !window.isDestroyed()) {
    window.webContents.send(channel, payload)
  }
}

// T8 回填编排(controller 裁决 4):spawn 成功后,自建且尚无 externalSessionId 的会话自动
// T8 回填编排(controller 裁决 4):spawn 成功后,自建且尚无 externalSessionId 的会话自动
// claim 资格并按节流轮询;发现新候选由本层把 id(及转录路径/标题,有则)写回记录、防抖落盘并
// 广播 sessions:changed(2026-11-24:渲染层侧栏即时跟随)——标题缺失时接力 pollForTitle 补捞
// (跟随 T4 既有模式:直接改 session 对象 + scheduleSave,sessionRecords 无 update 方法)。
function startBackfillIfEligible(
  store: AppStore,
  scheduleSave: () => void,
  getWindow: () => BrowserWindow | null,
  session: Session,
  def: AgentDefinition
): void {
  const scan = def.sessions?.scan
  // 项目路径从 store.projects 取,取不到不轮询(controller 裁决 4)
  const project = store.projects.find((item) => item.id === session.projectId)
  if (!scan || !project) {
    return // 无扫描器或项目路径缺失:记录保持无 id,重开原样拉起
  }
  // Fix-1(评审 Important-1):进入即记 claim 时刻,候选新鲜度护栏的基准线——首扫在 spawn 后
  // 立即执行,只认「文件出现于 claim 之后」的新文件,存储里从未导入的历史文件(T6 导入遗漏、
  // 跳过、解析失败)不再被误当新会话写回(重开续接到别的对话的失败形态)
  const claimedAtMs = Date.now()
  // 逐候选 stat 取 mtimeMs;失败(文件消失/权限等)吞掉返回 null,该候选本 tick 丢弃
  const mtimeOf = (filePath: string): number | null => {
    try {
      return statSync(filePath).mtimeMs
    } catch {
      return null
    }
  }
  // scan 闭包只留「新会话」:该 agentId 已有 externalSessionId 的(导入的 + 回填过的)不再候选;
  // 每次扫描现取已知集合(controller 裁决 4:闭包内部先取集合过滤),再过新鲜度护栏
  // (Fix-1:老文件/mtime 不可判候选本 tick 丢弃,保留者按 mtime 升序,最早者属先 spawn 的本会话)
  let lastCandidates: ImportCandidate[] = []
  const scanNewOnly = async (): Promise<ImportCandidate[]> => {
    const candidates = await scan(project.path)
    const known = new Set<string>()
    for (const item of store.sessions) {
      if (item.agentId === session.agentId && item.externalSessionId) {
        known.add(item.externalSessionId)
      }
    }
    lastCandidates = filterFreshCandidates(
      candidates.filter((candidate) => !known.has(candidate.externalSessionId)),
      claimedAtMs,
      mtimeOf
    )
    return lastCandidates
  }
  // 资格:同 agent+项目仅一个持有者,activePeers = 当前轮询中的会话(controller 裁决 4);
  // 拿不到资格则本会话不回填,重开原样拉起(brief 第 5 节)
  if (!BackfillCoordinator.claim(session, BackfillCoordinator.pollingSessions())) {
    return
  }
  void BackfillCoordinator.poll(session, scanNewOnly).then((id) => {
    if (!id) {
      return // 放弃:记录保持无 id(重开原样拉起)
    }
    // 写回记录:id(及转录路径/标题,有则)+ 防抖落盘 + 广播渲染层(poll 只回 id,候选由闭包留在 lastCandidates)
    session.externalSessionId = id
    const found = lastCandidates.find((candidate) => candidate.externalSessionId === id)
    if (found?.filePath) {
      session.externalFilePath = found.filePath
    }
    const title = pickBackfillTitle(session.title, def.name, found)
    if (title) {
      session.title = title
    }
    scheduleSave()
    sendToRenderer(getWindow, IPC_CHANNELS.sessionsChanged, session)
    // 标题补捞:候选尚无标题(pi 启动即建文件、首条消息前无标题)且用户未改名时接力轮询,
    // 节流沿用回填档位、2 分钟放弃(标题只是显示优化);拿到后再守卫一次——补捞期间会话可能
    // 被删除或被用户改名,记录不在/名字已换即放弃,绝不覆盖用户命名
    if (found && !found.externalTitle && session.title === def.name) {
      void BackfillCoordinator.pollForTitle(session.id, id, () => scan(project.path)).then(
        (lateTitle) => {
          const current = sessionRecords.get(store, session.id)
          if (!current || !lateTitle || current.title !== def.name) {
            return // 已删除/超时/补捞期间用户改名:不动
          }
          current.title = lateTitle
          scheduleSave()
          sendToRenderer(getWindow, IPC_CHANNELS.sessionsChanged, current)
        }
      )
    }
  })
}

export function registerPtyIpc(
  store: AppStore,
  scheduleSave: () => void,
  getWindow: () => BrowserWindow | null,
  injector?: Injector
): void {
  ipcMain.handle(
    IPC_CHANNELS.ptySpawn,
    // cols/rows = 渲染层 fit 提案(Fix-A),透传注册表;非法值由注册表接缝回退兜底
    // T8:resume 可选(渲染层从重开的会话记录构造;无 externalSessionId 不带,imported 有 id 同样续接)
    async (
      _event,
      p: {
        sessionId: SessionId
        agentId: AgentId
        cwd: string
        cols: number
        rows: number
        resume?: ResumeRef
      }
    ): Promise<void> => {
      // agentId 支持别名(kimi-code),经注册表归一后取定义
      const def = agentRegistry.getById(p.agentId)
      if (!def) {
        throw new Error(`未知 agent:${p.agentId}`)
      }
      // T8 续接决策(controller 裁决 2):ref 经定义构造参数部分;
      // null / 无 resumeArgv / 无 resume → 原样拉起(不抛错)
      const resumeArgv = p.resume ? (def.sessions?.resumeArgv?.(p.resume) ?? null) : null
      // hook-run-state T2:PTY env 注入路由令牌(转发脚本沿进程链继承后读 env 回传事件);
      // 接收器未启动/端口未就绪则不注入(该会话无 hook 上报,spawn 照常)
      // hook-run-state T3:spawn 前自愈(配置缺失补写;失败不阻塞 spawn,该会话无 hook 上报)
      if (injector) {
        try {
          await injector.ensureProject(p.cwd)
        } catch (error) {
          console.error('[agent-hooks] spawn 前注入自愈失败:', error)
        }
      }
      const receiverInfo = getReceiverInfo()
      await ptyRegistry.spawn({
        sessionId: p.sessionId,
        def,
        cwd: p.cwd,
        cols: p.cols,
        rows: p.rows,
        ...(resumeArgv && resumeArgv.length > 0 ? { launchArgs: resumeArgv } : {}),
        ...(receiverInfo
          ? {
              hookEnv: {
                SOLOPORT_SESSION_ID: p.sessionId,
                SOLOPORT_HOOK_PORT: String(receiverInfo.port),
                SOLOPORT_HOOK_TOKEN: receiverInfo.token
              }
            }
          : {})
      })
      // spawn 成功后自动 claim + 轮询(controller 裁决 4);imported / 已有 id 不参与
      const session = sessionRecords.get(store, p.sessionId)
      if (session && session.origin === 'created' && !session.externalSessionId) {
        startBackfillIfEligible(store, scheduleSave, getWindow, session, def)
      }
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.ptyWrite,
    (_event, p: { sessionId: SessionId; data: string }): void => {
      ptyRegistry.write(p.sessionId, p.data)
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.ptyResize,
    (_event, p: { sessionId: SessionId; cols: number; rows: number }): void => {
      ptyRegistry.resize(p.sessionId, p.cols, p.rows)
    }
  )

  ipcMain.handle(IPC_CHANNELS.ptyKill, (_event, sessionId: SessionId): void => {
    // 待回填会话的标签页关闭即释放资格(后开者接棒);release 同时中止在途轮询,
    // 防止已死 agent 的轮询误捞接棒会话的新文件(controller 裁决 4 + brief 第 5 节)
    BackfillCoordinator.release(sessionId)
    ptyRegistry.kill(sessionId)
  })

  // 事件出站:注册表 → 渲染层(退订函数在单窗口应用生命周期内不需调用)
  // T3 合并转发:data 先入每会话合并器(16ms 窗口或 64KB 先到先发,brief 第 5 节),
  // 把每秒数千条 data 事件压到每会话约 60 条;exit 前先 flushSession 清空该会话缓冲,
  // 退出事件不越过尾数据。投递失败沿用 sendToRenderer 的窗口存活判断,合并器不另设错误路径。
  const dataCoalescer = createPtyDataCoalescer({
    windowMs: PTY_DATA_COALESCE_WINDOW_MS,
    maxChars: PTY_DATA_COALESCE_MAX_CHARS,
    flush: (sessionId, text) => {
      sendToRenderer(getWindow, IPC_CHANNELS.ptyData, { sessionId, data: text })
    }
  })
  ptyRegistry.onData((event) => {
    dataCoalescer.push(event.sessionId, event.data)
  })
  ptyRegistry.onExit((event) => {
    dataCoalescer.flushSession(event.sessionId) // 退出保序:尾数据先于 exit 到渲染层
    sendToRenderer(getWindow, IPC_CHANNELS.ptyExit, event)
  })
}
