// pty 域薄编排层:spawn/write/resize/kill 透传注册表;data/exit 事件推渲染层
// (样板同 ipc/projects.ts;窗口经注入的取窗函数拿,便于单窗口应用跟随重建)
// T8 增补:spawn 载荷可选 resume(重开续接)、spawn 成功后自动 claim 回填资格并轮询、
// kill 时释放资格。store 与落盘回调由入口装配处注入(controller 裁决 4:不跨域 import,
// scheduleSave 来自 registerSessionsIpc 的防抖保存器)。
import { ipcMain, type BrowserWindow } from 'electron'
import { statSync } from 'node:fs'
import { IPC_CHANNELS } from './channels'
import { ptyRegistry } from '../pty-registry'
import { agentRegistry } from '../agents/agent-registry'
import { BackfillCoordinator, filterFreshCandidates } from '../session-store/backfill'
import { sessionRecords } from '../session-store/session-records'
import { getReceiverInfo } from '../agent-hooks/receiver'
import type { Injector } from '../agent-hooks/injector'
import type { AgentDefinition, ImportCandidate, ResumeRef } from '../../shared/agents'
import type { AppStore, AgentId, Session, SessionId } from '../../shared/types'
import type { PtyDataEvent, PtyExitEvent } from '../../shared/ipc-contract'

function sendToRenderer(
  getWindow: () => BrowserWindow | null,
  channel: string,
  payload: PtyDataEvent | PtyExitEvent
): void {
  const window = getWindow()
  if (window && !window.isDestroyed()) {
    window.webContents.send(channel, payload)
  }
}

// T8 回填编排(controller 裁决 4):spawn 成功后,自建且尚无 externalSessionId 的会话自动
// claim 资格并按节流轮询;发现新候选由本层把 id(及转录路径,有则)写回记录并防抖落盘
// (跟随 T4 既有模式:直接改 session 对象 + scheduleSave,sessionRecords 无 update 方法)。
function startBackfillIfEligible(
  store: AppStore,
  scheduleSave: () => void,
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
    // 写回记录:id(及转录路径,有则)+ 防抖落盘(poll 只回 id,候选由闭包留在 lastCandidates)
    session.externalSessionId = id
    const found = lastCandidates.find((candidate) => candidate.externalSessionId === id)
    if (found?.filePath) {
      session.externalFilePath = found.filePath
    }
    scheduleSave()
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
        try { await injector.ensureProject(p.cwd) } catch (error) { console.error('[agent-hooks] spawn 前注入自愈失败:', error) }
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
        startBackfillIfEligible(store, scheduleSave, session, def)
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
  ptyRegistry.onData((event) => {
    sendToRenderer(getWindow, IPC_CHANNELS.ptyData, event)
  })
  ptyRegistry.onExit((event) => {
    sendToRenderer(getWindow, IPC_CHANNELS.ptyExit, event)
  })
}
