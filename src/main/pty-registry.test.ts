// 接缝 buildSpawnArgv / samplingTap 模块行为测试(契约「测试规格」第 1–4 条)
// 期望值来源:brief 第 5 节固定清单(claude/kimi 规范命令)与构造反例(临时样本目录、伪字节流);
// 不起真实 PTY:node-pty 以 vi.mock 打桩,字节流用 EventEmitter 模拟。
import { EventEmitter } from 'node:events'
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, win32 } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { spawn as ptySpawn, type IPty, type IWindowsPtyForkOptions } from 'node-pty'
import { agentRegistry } from './agents/agent-registry'
import { claudeAgent } from './agents/definitions/claude'
import {
  buildAgentLaunchLine,
  buildPowerShellLaunchScript,
  buildShellInjectLine,
  buildShellLaunchLine,
  buildShellSpawnArgs,
  quotePowerShellArg,
  resolveShellExecutable,
  buildSpawnArgv,
  ptyRegistry,
  quoteLaunchArg,
  resolvePtyFirstSize,
  samplingTap,
  UNMEASURED_PTY_SIZE
} from './pty-registry'

// node-pty 打桩:真实 PTY 不进单测(契约「不起真实 PTY」);spawn 调用参数由用例断言
vi.mock('node-pty', () => ({ spawn: vi.fn() }))
const ptySpawnMock = vi.mocked(ptySpawn)

// 环境变量现场:采样开关与 PATH 都从 process.env 读,用例内保存/恢复(controller 口径 4)
let savedSampleEnv: string | undefined
let savedPathEnv: string | undefined

beforeEach(() => {
  savedSampleEnv = process.env.AGENT_SESSIONS_SAMPLE
  savedPathEnv = process.env.PATH
  ptySpawnMock.mockReset()
})

afterEach(() => {
  if (savedSampleEnv === undefined) {
    delete process.env.AGENT_SESSIONS_SAMPLE
  } else {
    process.env.AGENT_SESSIONS_SAMPLE = savedSampleEnv
  }
  if (savedPathEnv === undefined) {
    delete process.env.PATH
  } else {
    process.env.PATH = savedPathEnv
  }
})

// 伪 PTY:ptyRegistry.spawn 只用到 EventEmitter 事件面与 write/resize/kill 方法
// (IPty 字段只读,先在宽松对象上赋值再整体断言)
function makeFakePty(): IPty {
  const fake = new EventEmitter() as EventEmitter & Record<string, unknown>
  fake.pid = 4242
  fake.cols = 80
  fake.rows = 24
  fake.handleFlowControl = false
  fake.onData = () => ({ dispose: () => undefined })
  fake.onExit = () => ({ dispose: () => undefined })
  fake.write = () => undefined
  fake.resize = () => undefined
  fake.kill = () => undefined
  return fake as unknown as IPty
}

// 轮询等待样本文件写出(追加写句柄异步落盘,无外部 flush 接口)
async function untilFileHas(file: string, want: string, timeoutMs = 3000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    try {
      if ((await readFile(file, 'utf8')).includes(want)) {
        return
      }
    } catch {
      // 文件尚未生成,继续等
    }
    if (Date.now() > deadline) {
      throw new Error(`样本文件未及时写出: ${file}`)
    }
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
}

describe('buildSpawnArgv', () => {
  it('claude 定义 + 项目目录:argv 首元素为 claude,spawn 参数 cwd 为项目目录(brief 第 5 节)', async () => {
    // 手算:buildSpawnArgv 是纯函数,argv = [规范命令]
    expect(buildSpawnArgv(claudeAgent)).toEqual(['claude'])

    // cwd 转发经 mock node-pty 观察不起真实 PTY;PATH 指向只含 claude 可执行体的临时目录,
    // 保证命令解析成功(解析失败 spawn 会按未安装抛错)
    const dir = await mkdtemp(join(tmpdir(), 'agent-sessions-argv-'))
    try {
      const binName = process.platform === 'win32' ? 'claude.EXE' : 'claude'
      await writeFile(join(dir, binName), '')
      process.env.PATH = dir
      ptySpawnMock.mockImplementation(() => makeFakePty())

      const projectDir = 'D:\\demo-project'
      await ptyRegistry.spawn({
        sessionId: 's-claude',
        def: claudeAgent,
        cwd: projectDir,
        cols: 126,
        rows: 49
      })

      expect(ptySpawnMock).toHaveBeenCalledTimes(1)
      const [file, args, options] = ptySpawnMock.mock.calls[0]
      // shell 底座(ADR-0004):PTY 交常驻 shell(agent 改经注入行启动),cwd 仍为项目目录;
      // 解析后的 agent 路径不再作 spawn file,由 buildShellLaunchLine 注入行用例钉住
      expect(file).toBe(process.env.ComSpec ?? 'cmd.exe')
      expect(args).toEqual([])
      expect(options.cwd).toBe(projectDir)

      // 守卫(T3.5 评审期 Fix):spawn env 注入终端能力标识——TUI 按这些变量决定是否启用鼠标
      // 上报与真彩,缺失即降级(pi 滚轮失效即此因)。期望值来源:Orca spawn-environment.ts
      // :183-184 原文(只读参考,MIT);PATH 断言钉住「默认继承 process.env、仅追加覆盖」形态。
      expect(options.env?.TERM).toBe('xterm-256color')
      expect(options.env?.COLORTERM).toBe('truecolor')
      expect(options.env?.PATH).toBe(dir)

      // 守卫(T3.5 评审期 Fix-A):Windows spawn 透传 node-pty 自带的 bundled ConPTY——系统
      // conhost 的旧 ConPTY 不透传鼠标模式 DECSET(?1000/?1002/?1006),xterm 端
      // mouseTrackingMode 恒 none,TUI(pi)滚轮失效;bundled 1.23 透传且提供 xterm 期望的
      // wrap-marker 行为。期望值来源:Orca native-pty-spawn.ts:91 原文
      // (...(process.platform === 'win32' ? { useConptyDll: true } : {}));非 win32 展开为空、
      // 字段缺席,断言同步按平台收窄。useConptyDll 属 spawn options 联合的 Windows 支,经其类型读。
      const windowsOptions = options as Partial<IWindowsPtyForkOptions>
      expect(windowsOptions.useConptyDll).toBe(process.platform === 'win32' ? true : undefined)
    } finally {
      await rm(dir, { recursive: true, force: true })
      ptyRegistry.killAll()
    }
  })

  it("'kimi-code' 别名定义:argv 首元素为规范命令 kimi(brief 第 5 节,手算)", () => {
    const def = agentRegistry.getById('kimi-code')
    expect(def, 'kimi-code 别名应归一到 kimi 定义').toBeDefined()
    expect(buildSpawnArgv(def!)).toEqual(['kimi'])
    expect(buildSpawnArgv(def!)![0]).not.toBe('kimi-code')
  })
})

describe('buildShellLaunchLine', () => {
  it('含空格路径:统一双引号包裹(测试规格 #1,构造反例)', () => {
    // 手算字面量:规则 = 命令整体包一层双引号,不做其他加工
    expect(buildShellLaunchLine('C:\\Program Files\\nodejs\\pi.cmd')).toBe(
      '"C:\\Program Files\\nodejs\\pi.cmd"'
    )
  })

  it('无空格路径:同样双引号包裹(测试规格 #2,统一规则)', () => {
    expect(buildShellLaunchLine('C:\\tools\\pi.cmd')).toBe('"C:\\tools\\pi.cmd"')
  })

  it('注入行拼装:PTY 交 shell(file=ComSpec、args 空),spawn 后经 pty.write 写「引号绝对路径 + \\r」(测试规格 #3)', async () => {
    // 独立事实源:fixture 可执行体确实位于 join(dir, binName);期望注入行 =
    // 引号包裹的该文件 win32 原生分隔符形态(stdlib 规整) + '\r' 结尾。
    // resolveCommandPath 输出的混排斜杠是实现细节,注入行必须规整为原生形态。
    const dir = await mkdtemp(join(tmpdir(), 'agent-sessions-inject-'))
    try {
      const binName = process.platform === 'win32' ? 'claude.EXE' : 'claude'
      await writeFile(join(dir, binName), '')
      process.env.PATH = dir
      const fake = makeFakePty()
      const writes: string[] = []
      fake.write = (data: string) => {
        writes.push(data)
      }
      ptySpawnMock.mockImplementation(() => fake)

      await ptyRegistry.spawn({
        sessionId: 's-inject',
        def: claudeAgent,
        cwd: 'D:\\demo-project',
        cols: 80,
        rows: 24
      })

      // shell 底座(ADR-0004):node-pty 收到的是常驻 shell,且不带参数
      const [file, args] = ptySpawnMock.mock.calls[0]
      expect(file).toBe(process.env.ComSpec ?? 'cmd.exe')
      expect(args).toEqual([])
      // 注入行与用户键入同通道:走 pty.write,全文 = 引号路径 + \r
      const realPath = join(dir, binName)
      const expected =
        process.platform === 'win32' ? `"${win32.normalize(realPath)}"\r` : `"${realPath}"\r`
      expect(writes).toEqual([expected])
    } finally {
      await rm(dir, { recursive: true, force: true })
      ptyRegistry.killAll()
    }
  })
})

// —— Fix-2 守卫:launchArgs 引号包裹(评审 Important-2)——
// 期望值来源:controller 修法裁定(含空白参数双引号包裹,与命令本体 buildShellLaunchLine
// 同一约定;注入行 = 引号命令 + 逐参数单空格拼串,无 args 退化为纯命令行)。
describe('quoteLaunchArg / buildAgentLaunchLine(launchArgs 引号包裹)', () => {
  it('无 args → 等于 buildShellLaunchLine(command)', () => {
    expect(buildAgentLaunchLine('C:\\tools\\pi.cmd')).toBe(
      buildShellLaunchLine('C:\\tools\\pi.cmd')
    )
    expect(buildAgentLaunchLine('C:\\tools\\pi.cmd', [])).toBe(
      buildShellLaunchLine('C:\\tools\\pi.cmd')
    )
  })

  it('含空格参数 → 双引号包裹(pi resume 形态:--session <转录路径>)', () => {
    expect(quoteLaunchArg('C:\\a b\\session.jsonl')).toBe('"C:\\a b\\session.jsonl"')
    expect(buildAgentLaunchLine('pi', ['--session', 'C:\\a b\\session.jsonl'])).toBe(
      '"pi" --session "C:\\a b\\session.jsonl"'
    )
  })

  it('不含空格参数 → 原样', () => {
    expect(quoteLaunchArg('--session')).toBe('--session')
    expect(quoteLaunchArg('C:\\a\\session.jsonl')).toBe('C:\\a\\session.jsonl')
  })

  it('多参数混合(一个含空格一个不含)→ 分别处理、单空格连接', () => {
    expect(buildAgentLaunchLine('pi', ['--session', 'C:\\a b\\session.jsonl', '--verbose'])).toBe(
      '"pi" --session "C:\\a b\\session.jsonl" --verbose'
    )
  })
})

describe('samplingTap', () => {
  it('采样开启 + 模拟字节流:样本文件生成且文件名含 sessionId,内容为流字节原样追加(构造反例)', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'agent-sessions-sample-'))
    try {
      process.env.AGENT_SESSIONS_SAMPLE = dir
      expect(samplingTap.enabled()).toBe(true)

      const stream = new EventEmitter()
      samplingTap.wrap('sess-fix3', stream)
      stream.emit('data', Buffer.from('CHUNK-ONE', 'utf8'))
      stream.emit('data', Buffer.from('CHUNK-TWO', 'utf8'))

      await untilFileHas(join(dir, 'sess-fix3.bin'), 'CHUNK-TWO')
      // 手算字面量:两次 emit 的字节原样拼接,证明是追加写而非覆盖
      expect(await readFile(join(dir, 'sess-fix3.bin'), 'utf8')).toBe('CHUNK-ONECHUNK-TWO')
      expect(await readdir(dir)).toEqual(['sess-fix3.bin'])
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('采样关闭 + 模拟字节流:不产生样本文件(构造反例)', async () => {
    delete process.env.AGENT_SESSIONS_SAMPLE
    expect(samplingTap.enabled()).toBe(false)

    const dir = await mkdtemp(join(tmpdir(), 'agent-sessions-sample-off-'))
    try {
      const stream = new EventEmitter()
      samplingTap.wrap('sess-fix4', stream)
      stream.emit('data', Buffer.from('SHOULD-NOT-LAND', 'utf8'))
      // 留出落盘时间窗:关闭状态下任何时刻都不应出现样本文件
      await new Promise((resolve) => setTimeout(resolve, 100))
      expect(await readdir(dir)).toEqual([])
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  // Fix-1 守卫:坏目录不得崩主进程——open 失败被 'error' 监听吃掉、本会话采样停用、
  // 后续字节不再尝试写(调试开关配置错误不以应用崩溃为代价)
  it('采样开启 + 目录不存在:进程不崩(uncaughtException 计 0),错误进 console.error,本会话停止采样', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    // 崩与不崩的观察口径:open 失败若无 'error' 监听,Node 以 uncaughtException 投递
    const uncaught: unknown[] = []
    const onUncaught = (error: unknown): void => {
      uncaught.push(error)
    }
    process.on('uncaughtException', onUncaught)
    try {
      // 坏目录:父目录也不存在的深层路径(开关开着但 createWriteStream 必然打开失败)
      process.env.AGENT_SESSIONS_SAMPLE = join(tmpdir(), 'agent-sessions-no-such-dir', 'deeper')
      expect(samplingTap.enabled()).toBe(true)

      const stream = new EventEmitter()
      samplingTap.wrap('sess-baddir', stream)
      stream.emit('data', Buffer.from('SHOULD-FAIL', 'utf8'))

      // open 失败以异步事件投递,留出事件窗
      await new Promise((resolve) => setTimeout(resolve, 150))

      expect(uncaught, 'open 失败必须被 error 监听吃掉,不得升级为 uncaughtException').toEqual([])
      expect(errorSpy).toHaveBeenCalledWith('采样写盘失败,本会话采样停用:', expect.any(Error))

      // 本会话已从采样内表摘除、data 监听已摘:后续字节不再写、不再触发新错误
      // Why 只数本模块那条消息:同文件其他用例的树杀是 fire-and-forget,其 console.error
      // (「taskkill 兜底未命中」「树杀快照失败」)会在几十~上百 ms 后异步落进本用例的等待窗;
      // 数「console.error 总调用数」会把这些无关日志算成采样又写了一次(实测 shuffle 下必现)。
      const samplingErrors = (): number =>
        errorSpy.mock.calls.filter(([message]) => message === '采样写盘失败,本会话采样停用:').length
      const errorsAfterFirst = samplingErrors()
      stream.emit('data', Buffer.from('AGAIN', 'utf8'))
      await new Promise((resolve) => setTimeout(resolve, 150))
      expect(samplingErrors(), '摘除后同会话不得再尝试写').toBe(errorsAfterFirst)
    } finally {
      process.off('uncaughtException', onUncaught)
      errorSpy.mockRestore()
    }
  })
})

// —— T3.5 评审期 Fix-A:spawn 初始尺寸(接缝 resolvePtyFirstSize)——
// 期望值来源:Orca pty-first-size 兜底常量 120×40(外部锚点 .reference/orca-1.4.265/
// src/main/ipc/pty/delivery/pty-first-size.ts)+ 手算的合法/非法输入反例。
describe('resolvePtyFirstSize', () => {
  it('渲染层真实提案:原样采用(手算:126×49 → 126×49)', () => {
    expect(resolvePtyFirstSize(126, 49)).toEqual({ cols: 126, rows: 49 })
  })

  it('边界合法值:1 与 500 均采用(手算:范围闭区间 1-500)', () => {
    expect(resolvePtyFirstSize(1, 1)).toEqual({ cols: 1, rows: 1 })
    expect(resolvePtyFirstSize(500, 500)).toEqual({ cols: 500, rows: 500 })
  })

  it('非整数/越界/缺省:回退未测量兜底 120×40(Orca UNMEASURED_PTY_SIZE 同款)', () => {
    expect(resolvePtyFirstSize(0, 49)).toEqual(UNMEASURED_PTY_SIZE)
    expect(resolvePtyFirstSize(501, 49)).toEqual(UNMEASURED_PTY_SIZE)
    expect(resolvePtyFirstSize(100.5, 49)).toEqual(UNMEASURED_PTY_SIZE)
    expect(resolvePtyFirstSize(126, -3)).toEqual(UNMEASURED_PTY_SIZE)
    expect(resolvePtyFirstSize(undefined, undefined)).toEqual(UNMEASURED_PTY_SIZE)
    expect(resolvePtyFirstSize(Number.NaN, 49)).toEqual(UNMEASURED_PTY_SIZE)
  })

  it('守卫:ptySpawn 收到的初始尺寸 = 传入的 fit 提案(不是硬编码 80×24)', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'agent-sessions-size-'))
    try {
      const binName = process.platform === 'win32' ? 'claude.EXE' : 'claude'
      await writeFile(join(dir, binName), '')
      process.env.PATH = dir
      ptySpawnMock.mockImplementation(() => makeFakePty())

      await ptyRegistry.spawn({
        sessionId: 's-size',
        def: claudeAgent,
        cwd: 'D:\demo-project',
        cols: 160,
        rows: 46
      })

      const [, , options] = ptySpawnMock.mock.calls[0]
      expect(options.cols).toBe(160)
      expect(options.rows).toBe(46)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})

describe('shell 分支(T11:settings.shell = cmd | powershell | pwsh)', () => {
  // 路径统一用正斜杠:被测的是「引号/调用运算符/参数拼装」,与分隔符方向无关
  it('PowerShell 脚本:用调用运算符 & 执行,并先设 UTF-8(手算字面量)', () => {
    const script = buildPowerShellLaunchScript('C:/Program Files/nodejs/pi.cmd')
    // 手算:chcp 65001 + OutputEncoding + `& '<path>'`;没有 & 的话 PS 只会打印字符串而不执行
    expect(script).toBe(
      "chcp 65001 > $null; [Console]::OutputEncoding = [Text.Encoding]::UTF8; & 'C:/Program Files/nodejs/pi.cmd'"
    )
  })

  it('PowerShell 参数:逐个单引号包裹(含空格的转录路径不会被 PS 拆段)', () => {
    const script = buildPowerShellLaunchScript('C:/tools/pi.cmd', [
      '--session',
      'C:/Users/Lenovo/.pi/a b/s.jsonl'
    ])
    expect(script).toContain("& 'C:/tools/pi.cmd' '--session' 'C:/Users/Lenovo/.pi/a b/s.jsonl'")
  })

  it('PowerShell 单引号转义:内部单引号双写(PS 规则)', () => {
    expect(quotePowerShellArg("it's")).toBe("'it''s'")
  })

  it('spawn 参数:cmd 为空(cmd 走注入行);powershell/pwsh 交给 -NoLogo -NoExit -Command', () => {
    expect(buildShellSpawnArgs('cmd', 'C:/x/pi.cmd', ['--session', 'f'])).toEqual([])

    const ps = buildShellSpawnArgs('powershell', 'C:/x/pi.cmd')
    expect(ps.slice(0, 3)).toEqual(['-NoLogo', '-NoExit', '-Command'])
    expect(ps[3]).toContain("& 'C:/x/pi.cmd'")

    // -NoExit:agent 退出后 shell 仍在,满足 ADR-0004「退出回提示符」
    expect(buildShellSpawnArgs('pwsh', 'C:/x/pi.cmd')).toContain('-NoExit')
  })

  it('注入行:只有 cmd 需要写(以 CR 结尾);非 cmd 返回 null 不写任何东西', () => {
    const cmdLine = buildShellInjectLine('cmd', 'C:/x/pi.cmd', ['--session', 'f'])
    expect(cmdLine).toBe('"C:/x/pi.cmd" --session f' + String.fromCharCode(13))
    expect(buildShellInjectLine('powershell', 'C:/x/pi.cmd')).toBeNull()
    expect(buildShellInjectLine('pwsh', 'C:/x/pi.cmd')).toBeNull()
  })

  it('shell 可执行文件:cmd 走 ComSpec;powershell/pwsh 用解析到的绝对路径,缺省退回裸名', () => {
    expect(resolveShellExecutable('cmd')).toBe(process.env.ComSpec ?? 'cmd.exe')
    expect(resolveShellExecutable('powershell', 'C:/W/powershell.exe')).toBe('C:/W/powershell.exe')
    expect(resolveShellExecutable('pwsh', null)).toBe('pwsh.exe')
  })
})
