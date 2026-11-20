// PTY 注册表:spawn(按定义构造命令、cwd=项目目录)/字节流转发/写入/resize/单杀/全量清理
// + 采样落盘开关(AGENT_SESSIONS_SAMPLE,供 M3 采样;spec 模块划分:src/main/pty-registry.ts)
import { EventEmitter } from 'node:events'
import { createWriteStream, type WriteStream } from 'node:fs'
import { join, win32 } from 'node:path'
import { spawn as ptySpawn, type IPty } from 'node-pty'
import { resolveCommandPath } from './command-path/command-path-resolver'
import type { AgentDefinition } from '../shared/agents'
import type { SessionId } from '../shared/types'

// 接缝(纯函数):别名归一后取规范命令,argv = [command];别名 → 定义的归一由 agentRegistry.getById 完成
export function buildSpawnArgv(def: AgentDefinition): string[] {
  return [def.command]
}

// 采样落盘开关(接缝):环境变量 AGENT_SESSIONS_SAMPLE=<目录> 开启;
// 开启时把字节流原样追加写入 <目录>/<sessionId>.bin,供 M3 采样
const taps = new Map<SessionId, WriteStream>()

export const samplingTap = {
  enabled(): boolean {
    return (process.env.AGENT_SESSIONS_SAMPLE ?? '') !== ''
  },
  wrap(id: SessionId, stream: EventEmitter): void {
    const dir = process.env.AGENT_SESSIONS_SAMPLE
    if (!dir) {
      return // 采样关闭:不建句柄、不挂监听
    }
    const out = createWriteStream(join(dir, `${id}.bin`), { flags: 'a' })
    const onChunk = (chunk: Buffer): void => {
      out.write(chunk)
    }
    // Why: WriteStream 打开失败(目录不存在/无权限/盘满)以异步 'error' 事件投递,
    // 无监听 = uncaughtException = 主进程崩溃 + 全部 PTY 成孤儿。采样只是调试开关,
    // 坏目录不得拖垮应用:吃掉错误并摘除本会话采样(停用后续写),PTY 与转发照常。
    out.on('error', (error: Error) => {
      console.error('采样写盘失败,本会话采样停用:', error)
      taps.delete(id)
      stream.off('data', onChunk)
    })
    taps.set(id, out)
    stream.on('data', onChunk)
  },
  // kill/退出时关闭句柄(Windows 上不关会一直占着样本文件)
  close(id: SessionId): void {
    const out = taps.get(id)
    if (out) {
      taps.delete(id)
      out.end()
    }
  }
}

// 进程事件出站:ipc/pty.ts 订阅后经 webContents.send 推渲染层('pty:data'/'pty:exit')
export interface PtyDataEvent {
  sessionId: SessionId
  data: string
}
export interface PtyExitEvent {
  sessionId: SessionId
  exitCode: number
}
type PtyDataListener = (event: PtyDataEvent) => void
type PtyExitListener = (event: PtyExitEvent) => void

const dataListeners = new Set<PtyDataListener>()
const exitListeners = new Set<PtyExitListener>()

interface PtyEntry {
  pty: IPty
}

// 内表:spawn 增条目、kill 删条目、killAll 清空(非接缝,行为靠冒烟)
const entries = new Map<SessionId, PtyEntry>()

export const ptyRegistry = {
  // 解析失败即抛「未安装」(controller 口径 3);渲染层菜单已按安装状态挡一层,此处兜底如实报错
  async spawn(p: { sessionId: SessionId; def: AgentDefinition; cwd: string }): Promise<void> {
    // Why: 同 id 二次 spawn 若直接 set 会覆盖内表,首个 pty 失去引用成孤儿;
    // 渲染层 randomUUID 下不可达,纵深防御:冲突即抛错,不覆盖、不拉起第二个进程
    if (entries.has(p.sessionId)) {
      throw new Error(`sessionId 冲突:${p.sessionId} 已有活动 PTY,拒绝重复 spawn`)
    }
    const argv = buildSpawnArgv(p.def)
    const resolved = await resolveCommandPath(p.def.command)
    if (!resolved) {
      throw new Error(`未找到 ${p.def.name} 的命令:${p.def.command}(未安装或不在 PATH)`)
    }
    // 规整外观:resolveCommandPath 返回可能正斜杠混排(移植件不改),Windows 下统一反斜杠;
    // 本机实测:node-pty 不认裸命令名(CreateProcess 不走 PATH 搜索),必须交解析后的绝对路径,
    // .cmd shim 直接交绝对路径即可拉起(见开发记录)
    const file = process.platform === 'win32' ? win32.normalize(resolved) : resolved
    const pty = ptySpawn(file, argv.slice(1), {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd: p.cwd
    })
    entries.set(p.sessionId, { pty })
    if (samplingTap.enabled()) {
      // Why: IPty 运行时是 EventEmitter('data'/'exit' 事件,node-pty 类型面未声明,本机已实测)
      samplingTap.wrap(p.sessionId, pty as unknown as EventEmitter)
    }
    // 字节流转发:单会话独占流,整段推渲染层(终端回显归 agent CLI,主进程不解析不积压)
    pty.onData((data) => {
      for (const listener of dataListeners) {
        listener({ sessionId: p.sessionId, data })
      }
    })
    pty.onExit(({ exitCode }) => {
      // 进程存活条目还在则顺势清理;kill 已删条目时事件照常发出(契约口径)
      if (entries.has(p.sessionId)) {
        entries.delete(p.sessionId)
        samplingTap.close(p.sessionId)
      }
      for (const listener of exitListeners) {
        listener({ sessionId: p.sessionId, exitCode })
      }
    })
  },

  // 未知 id 静默忽略(契约口径)
  write(id: SessionId, data: string): void {
    entries.get(id)?.pty.write(data)
  },

  resize(id: SessionId, cols: number, rows: number): void {
    entries.get(id)?.pty.resize(cols, rows)
  },

  // 单杀:杀进程并删条目;exit 事件由 pty 的 onExit 异步照常发出
  kill(id: SessionId): void {
    const entry = entries.get(id)
    if (!entry) {
      return // 未知 id 静默忽略,与 write 同口径(关 tab 双击、已退出会话的重复 kill 都落这里)
    }
    entries.delete(id)
    samplingTap.close(id)
    entry.pty.kill()
  },

  // 全量清空;应用退出时调用(before-quit),不留孤儿进程
  killAll(): void {
    for (const [id, entry] of entries) {
      entries.delete(id)
      samplingTap.close(id)
      entry.pty.kill()
    }
  },

  // 订阅返回退订函数(契约推荐形态);ipc/pty.ts 装配时挂一次
  onData(listener: PtyDataListener): () => void {
    dataListeners.add(listener)
    return () => {
      dataListeners.delete(listener)
    }
  },
  onExit(listener: PtyExitListener): () => void {
    exitListeners.add(listener)
    return () => {
      exitListeners.delete(listener)
    }
  }
}
