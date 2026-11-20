// 接缝 buildSpawnArgv / samplingTap 模块行为测试(契约「测试规格」第 1–4 条)
// 期望值来源:brief 第 5 节固定清单(claude/kimi 规范命令)与构造反例(临时样本目录、伪字节流);
// 不起真实 PTY:node-pty 以 vi.mock 打桩,字节流用 EventEmitter 模拟。
import { EventEmitter } from 'node:events'
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { spawn as ptySpawn, type IPty } from 'node-pty'
import { agentRegistry } from './agents/agent-registry'
import { claudeAgent } from './agents/definitions/claude'
import { buildSpawnArgv, ptyRegistry, samplingTap } from './pty-registry'

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
      await ptyRegistry.spawn({ sessionId: 's-claude', def: claudeAgent, cwd: projectDir })

      expect(ptySpawnMock).toHaveBeenCalledTimes(1)
      const [file, args, options] = ptySpawnMock.mock.calls[0]
      expect(file.endsWith(binName)).toBe(true)
      expect(args).toEqual([])
      expect(options.cwd).toBe(projectDir)
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
      const callsAfterFirstError = errorSpy.mock.calls.length
      stream.emit('data', Buffer.from('AGAIN', 'utf8'))
      await new Promise((resolve) => setTimeout(resolve, 150))
      expect(errorSpy.mock.calls.length, '摘除后同会话不得再尝试写').toBe(callsAfterFirstError)
    } finally {
      process.off('uncaughtException', onUncaught)
      errorSpy.mockRestore()
    }
  })
})
