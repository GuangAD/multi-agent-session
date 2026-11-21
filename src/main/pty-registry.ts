// PTY 注册表:spawn(常驻 shell 底座 ADR-0004:PTY=shell、agent 命令注入启动、cwd=项目目录)
// /字节流转发/写入/resize/单杀/全量清理
// + 采样落盘开关(AGENT_SESSIONS_SAMPLE,供 M3 采样;spec 模块划分:src/main/pty-registry.ts)
import { execFile } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { createWriteStream, type WriteStream } from 'node:fs'
import { join, win32 } from 'node:path'
import { promisify } from 'node:util'
import { spawn as ptySpawn, type IPty } from 'node-pty'
import { resolveCommandPath } from './command-path/command-path-resolver'
import type { AgentDefinition } from '../shared/agents'
import type { SessionId } from '../shared/types'

// 接缝(纯函数):别名归一后取规范命令,argv = [command];别名 → 定义的归一由 agentRegistry.getById 完成
export function buildSpawnArgv(def: AgentDefinition): string[] {
  return [def.command]
}

// 接缝(纯函数,T3.5 评审期 Fix-A):spawn 初始尺寸解析。
// Ported from stablyai/orca src/main/ipc/pty/delivery/pty-first-size.ts (MIT)
// Why: TUI(pi 等)在 Windows ConPTY 下收不到 resize 通知(nodejs/node#13197 缺陷域),
// 启动宽度即它看到的终身宽度——必须以渲染层 fit 提案的真实尺寸起步,80×24 硬编码会让
// 大窗口下右侧整段空白。渲染层未测/传坏值时回退未测量兜底 120×40(Orca UNMEASURED_PTY_SIZE
// 同款:宁大勿小,大窗起步加 resize 对冲优于小窗重排);非法 = 缺省/非整数/越界(1-500 外)。
export const UNMEASURED_PTY_SIZE = { cols: 120, rows: 40 } as const

export function resolvePtyFirstSize(
  cols: number | undefined,
  rows: number | undefined
): { cols: number; rows: number } {
  const isValid = (n: number | undefined): n is number =>
    typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= 500
  return isValid(cols) && isValid(rows) ? { cols, rows } : { ...UNMEASURED_PTY_SIZE }
}

// 接缝(纯函数,ADR-0004):agent 启动命令行 = 绝对路径统一双引号包裹;注入行 = 该行 + '\r',
// spawn 后经 pty.write 写入 shell,与用户键入同通道(cmd 的输入行回显即用户看到的命令行)。
// 边界:不做 cmd 元字符(^ & | >)的转义矩阵——command 是应用经 resolveCommandPath 构造的
// 绝对路径,自身不含引号,不是用户自由输入;若未来接受用户可控命令行,须先补转义。
export function buildShellLaunchLine(command: string): string {
  return `"${command}"`
}

// Fix-2(评审 Important-2,接缝纯函数):launchArgs 逐参数引号包裹——参数含空白即双引号包住
// (命令本体 buildShellLaunchLine 同一约定)。Why: 注入行写入 cmd.exe,pi 按转录路径续接时
// `--session <含空格路径>` 裸拼会被 shell 拆成多段,resume 静默失灵;Windows 首发平台家目录
// 含空格现实存在。边界与 buildShellLaunchLine 一致:Windows 路径不含 ",不涉及转义矩阵。
export function quoteLaunchArg(arg: string): string {
  return /\s/.test(arg) ? `"${arg}"` : arg
}

// 注入行 = 引号命令 + 空格 + 逐参数(引号处理)单空格拼串;无 args 返回 buildShellLaunchLine(command)
export function buildAgentLaunchLine(command: string, args?: string[]): string {
  const line = buildShellLaunchLine(command)
  if (!args || args.length === 0) {
    return line
  }
  return line + ' ' + args.map(quoteLaunchArg).join(' ')
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

// 孤儿进程兜底(T3.5 评审期修复,方案 A):Windows 树杀。机理:node-pty 在 Windows kill PTY 时派
// conpty_console_list_agent 子代理 AttachConsole(shellPid) 枚举控制台内进程列表以连带清理 shell 的
// 子进程;附加失败(目标已死/已分离,dev 日志 "Error: AttachConsole failed")→ 枚举失败。实测补充:
// pty.kill 后 shell 在几十 ms 内死亡,taskkill 启动需 50-150ms,对根 PID 的 taskkill /T /F 必拿
// 128(根已死、/T 无法走树);同控制台子进程随控制台关闭已被连带收掉,真正够不到的孤儿是
// 「跨控制台子进程」(start 新开控制台,枚举与控制台关闭均不可见,实测仅 pty.kill 后存活)。
// shell 底座(ADR-0004)后 agent 是 cmd 的子进程,Windows 杀父不级联。
// 兜底两段式(kill/killAll 先 pty.kill,本函数 fire-and-forget 并发发起,不阻塞事件转发):
// ① PowerShell CIM 一次全量进程表,客户端按 ParentProcessId BFS 收敛 root 后代树;
// ② 对每个存活后代 taskkill /F 直接击杀(不依赖根存活),再补一发 taskkill /T /F root
//    (根若仍在则整树补刀;已死 128「找不到进程」属正常,不算失败)。
// 边界:best-effort 兜底——taskkill/PowerShell 为独立 OS 进程,发起后不受应用退出影响,killAll
// 发起即生效;运行期关闭有完整保护,应用退出恰落在快照窗口(<1s)内属残余窗口,接受;快照与
// 击杀间存在 <1s 的 PID 复用窗口(风险极小,接受)。所有失败吞掉打 console.error,永不 reject。
// 首发平台 Windows:taskkill/PowerShell 原生可用;非 win32 无此工具,仍走原 node-pty kill
// (POSIX 不适配,本任务不处理)。
const execFileAsync = promisify(execFile)

// taskkill 单发:失败吞掉打 console.error,永不 reject(128 = 目标已死,属正常不算失败)
async function runTaskkill(args: string[]): Promise<void> {
  try {
    await execFileAsync('taskkill', args)
  } catch (error) {
    console.error(`taskkill 兜底未命中(${args.join(' ')},目标已死属正常):`, error)
  }
}

// ① 快照:PowerShell CIM 一次全量进程表(逐层单查要多轮 spawn;全量表一次拿齐,
// 实测约 0.6-0.9s,异步不阻塞事件转发),客户端按 ParentProcessId BFS 收敛后代
async function snapshotDescendants(rootPid: number): Promise<number[]> {
  const { stdout } = await execFileAsync('powershell', [
    '-NoProfile',
    '-Command',
    'Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId | ConvertTo-Csv -NoTypeInformation'
  ])
  const childrenOf = new Map<number, number[]>()
  for (const line of stdout.split(/\r?\n/).slice(1)) {
    if (!line) {
      continue
    }
    const cells = line.split(',').map((cell) => Number.parseInt(cell.trim().replace(/\"/g, ''), 10))
    const pid = cells[0]
    const parentPid = cells[1]
    if (pid === undefined || parentPid === undefined || Number.isNaN(pid) || Number.isNaN(parentPid)) {
      continue
    }
    const siblings = childrenOf.get(parentPid)
    if (siblings) {
      siblings.push(pid)
    } else {
      childrenOf.set(parentPid, [pid])
    }
  }
  const descendants: number[] = []
  const queue: number[] = [rootPid]
  while (queue.length > 0) {
    const current = queue.pop()
    if (current === undefined) {
      break
    }
    for (const child of childrenOf.get(current) ?? []) {
      descendants.push(child)
      queue.push(child)
    }
  }
  return descendants
}

export async function killProcessTree(pid: number): Promise<void> {
  if (process.platform !== 'win32') {
    return // POSIX 不适配(首发平台约束),树杀兜底仅 Windows 有意义
  }
  let descendants: number[] = []
  try {
    descendants = await snapshotDescendants(pid)
  } catch (error) {
    // 快照失败(PowerShell 异常等)吞掉打日志,降级为仅根整树补刀;兜底永不 reject
    console.error(`树杀快照失败(pid=${pid}),降级为仅根补刀:`, error)
  }
  await Promise.all(descendants.map((child) => runTaskkill(['/F', '/PID', String(child)])))
  await runTaskkill(['/T', '/F', '/PID', String(pid)])
}

// 进程事件出站:ipc/pty.ts 订阅后经 webContents.send 推渲染层('pty:data'/'pty:exit')
// 'pty:exit' 语义(ADR-0004,收窄):PTY(shell)退出即标签页终端终结;agent CLI 退出回 shell
// 不触发,运行状态判断归 T5 状态引擎(渲染层 runState 仍按 PTY 生命周期,shell 活 = running)
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
  // T8:launchArgs 可选(重开续接的参数部分,ipc/pty.ts 经 resumeArgv 构造后透传)
  async spawn(p: {
    sessionId: SessionId
    def: AgentDefinition
    cwd: string
    cols: number
    rows: number
    launchArgs?: string[]
  }): Promise<void> {
    // Why: 同 id 二次 spawn 若直接 set 会覆盖内表,首个 pty 失去引用成孤儿;
    // 渲染层 randomUUID 下不可达,纵深防御:冲突即抛错,不覆盖、不拉起第二个进程
    if (entries.has(p.sessionId)) {
      throw new Error(`sessionId 冲突:${p.sessionId} 已有活动 PTY,拒绝重复 spawn`)
    }
    const argv = buildSpawnArgv(p.def)
    const resolved = await resolveCommandPath(argv[0])
    if (!resolved) {
      throw new Error(`未找到 ${p.def.name} 的命令:${p.def.command}(未安装或不在 PATH)`)
    }
    // 规整外观:resolveCommandPath 返回可能正斜杠混排(移植件不改),Windows 下统一反斜杠,
    // 注入行交 cmd 识别原生路径形态(解析后绝对路径/.cmd shim 直拉已实测,见开发记录)
    const launchCommand = process.platform === 'win32' ? win32.normalize(resolved) : resolved
    // shell 底座(ADR-0004):PTY 跑常驻 shell(Windows 首发 ComSpec,缺省 cmd.exe;POSIX 不适配),
    // agent CLI 由应用在 shell 内启动——CLI 退出回提示符,标签页与交互保留
    const file = process.env.ComSpec ?? 'cmd.exe'
    // Fix-A:初始尺寸 = 渲染层 fit 提案(坏值/缺省在接缝内回退兜底,见 resolvePtyFirstSize)
    const firstSize = resolvePtyFirstSize(p.cols, p.rows)
    const pty = ptySpawn(file, [], {
      name: 'xterm-256color',
      cols: firstSize.cols,
      rows: firstSize.rows,
      cwd: p.cwd,
      // Ported from stablyai/orca src/main/daemon/pty-subprocess/spawn-environment.ts (MIT)
      // Why: TUI 按 TERM/COLORTERM/TERM_PROGRAM 等变量决定是否启用鼠标上报与真彩,缺失即降级。
      // 我们 spawn 自 Electron GUI 进程,环境无 TERM,继承即缺失;pi 实测进入交替屏(?1049h)
      // 却完全不开鼠标上报(1000/1002/1003/1006 全无),应用内滚轮失效即此因。值取 Orca 同款
      // (spawn-environment.ts:183-186),TERM_PROGRAM 改本应用名;默认继承 process.env,仅追加覆盖。
      // TERM_PROGRAM_VERSION 不读 package.json(避免 fs 读取),硬编码,与 package.json 同步维护。
      env: {
        ...process.env,
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor',
        TERM_PROGRAM: 'agent-sessions',
        TERM_PROGRAM_VERSION: '0.1.0'
      },
      // Ported from stablyai/orca src/main/daemon/pty-subprocess/native-pty-spawn.ts (MIT)
      // Why: 我们 spawn 未传 useConptyDll 时走系统 conhost 的旧 ConPTY——它消费鼠标模式
      // DECSET(?1000/?1002/?1006)却不透传,xterm 端 mouseTrackingMode 恒 none,TUI(pi)的
      // 滚轮事件发不出去。node-pty 1.1.0 自带微软 terminal 1.23 的 conpty.dll(bundled),
      // 透传鼠标模式且提供 xterm 期望的 wrap-marker 行为(native-pty-spawn.ts:90-91 原文
      // 注释「Bundled ConPTY provides the wrap-marker behavior xterm expects」)。该字段仅
      // Windows 生效(node-pty typings),非 win32 不传。
      ...(process.platform === 'win32' ? { useConptyDll: true } : {})
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
    // 注入 agent 启动命令(与用户键入同通道):cmd 无 banner,spawn 后立即写入通常可靠;
    // 冒烟若实测丢首字符,改为等待首帧 data 再注入。
    // Fix-C 确认:注入发生在 spawn 之后,而 spawn 尺寸已是 fit 真值(Fix-B 保证 spawn 等首个
    // fit 完成),pi 启动即拿到正确宽度,注入时机无需再改。
    // T8(controller 裁决 2)+ 评审 Fix-2:注入行经 buildAgentLaunchLine 组装——launchArgs 非空时
    // = 引号命令 + 逐参数(含空白者双引号包裹,如 pi 的 --session <转录路径>)拼串;参数同样
    // 来自应用构造(externalSessionId/转录路径,非用户自由输入),Windows 路径不含 ",
    // 维持「不引 shell 转义矩阵」边界(ADR-0004 边界注释的 T8 延伸)。
    pty.write(buildAgentLaunchLine(launchCommand, p.launchArgs) + '\r')
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
    // 孤儿兜底:先 pty.kill 保其正常 exit 事件语义,taskkill 随即并发发起;
    // 不 await——树杀不得阻塞 data/exit 事件转发
    void killProcessTree(entry.pty.pid)
  },

  // 全量清空;应用退出时调用(before-quit),不留孤儿进程
  killAll(): void {
    for (const [id, entry] of entries) {
      entries.delete(id)
      samplingTap.close(id)
      entry.pty.kill()
      void killProcessTree(entry.pty.pid) // 同 kill:并发兜底,不 await
    }
  },

  // 存活会话 id(读):删除会话记录时判定「有活动标签页」的来源——shell 活着即有活动 tab
  activeSessionIds(): SessionId[] {
    return [...entries.keys()]
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
