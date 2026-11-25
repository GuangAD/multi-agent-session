// Fix-2 守卫 + T4 迁移:pty:data 早于 xterm 注册到达时「先到先存、注册即放」,启动输出不丢
// 落法:use-terminal 是渲染层模块,node 环境下对其 import 面(bridge = window.api、
// @xterm/xterm、@xterm/addon-fit)与 rAF/ResizeObserver 全局打桩;数据泵经写入调度器统一队列
// (write(data, done) 桩形态,done 由测试手动放行),断言打在 Terminal 写入序列/fit 调用/
// 滚轮 dispatch/bridge.pty.write 调用记录上(环境桩不碰被测逻辑)
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { bridge } from '../../ipc/bridge'
import {
  WRITE_QUEUE_LIMIT_CHARS,
  activateTerminal,
  applyTerminalAppearanceToAll,
  closeTerminal,
  openTerminal,
  resetAppliedAppearanceCache,
  resetWritePumpLoop,
  setTerminalVisible
} from './use-terminal'
import { resolveTerminalAppearance } from '../../../../shared/themes/resolve'
import { TERMINAL_THEMES } from '../../../../shared/themes/catalog'
import { DEFAULT_FONT_FALLBACK_CHAIN } from '../../../../shared/themes/fonts'
import type { Settings } from '../../../../shared/types'

interface PumpEvent {
  sessionId: string
  data: string
}

// xterm 官方滚轮钩子的 handler 形状(typings/xterm.d.ts attachCustomWheelEventHandler)
type CustomWheelHandler = (event: WheelEvent) => boolean

type ProposedDimensions = { cols: number; rows: number }
// 宽度表 provider 桩形状(xterm proposed API IUnicodeVersionProvider 的必要面)
type UnicodeProviderStub = {
  version: string
  wcwidth: (codepoint: number) => 0 | 1 | 2
  charProperties: (codepoint: number, preceding: number) => number
}
type XtermModesStub = { mouseTrackingMode: 'none' | 'x10' | 'vt200' | 'drag' | 'any' }

// vi.hoisted:供 mock 工厂捕获泵回调与 xterm 写入序列(工厂先于测试文件体执行,防 TDZ)
const {
  onPtyDataHandlers,
  createdTerminals,
  createdFitAddons,
  fitObservers,
  rafState,
  createdWebglAddons
} =
  vi.hoisted(() => {
    const onPtyDataHandlers: Array<(event: PumpEvent) => void> = []
    const createdTerminals: Array<{
      writes: string[]
      // T4:write(data, done) 桩形态——记录投递回调,由测试手动放行(真实 xterm 解析完才回调)
      writeDoneCallbacks: Array<() => void>
      scrolled: number[]
      options: Record<string, unknown>
      // 运行时整包应用记录(真实 xterm = options setter 部分合并);构造期不走 setter 不进此表
      appliedOptions: Array<Record<string, unknown>>
      // 宽度表句柄(xterm proposed API):用例断言其被激活到 '11'
      // 宽度表句柄(xterm proposed API):用例断言自定义 RGI provider 被注册并激活
      unicode: {
        activeVersion: string
        versions: string[]
        register: (provider: UnicodeProviderStub) => void
      }
      registeredUnicodeProviders: UnicodeProviderStub[]
      // xterm 私有内核投影:provider 激活逻辑从这里取 Unicode11 基表(桩内置一份)
      _core: { unicodeService?: { _providers?: Record<string, UnicodeProviderStub> } }
      buffer: {
        active: {
          type: 'normal' | 'alternate'
          baseY: number
          getLine: (
            index: number
          ) => { translateToString: (trimRight?: boolean) => string } | undefined
        }
      }
      customWheelHandlers: Array<(event: WheelEvent) => boolean>
      customKeyHandlers: Array<(event: KeyboardEvent) => boolean>
      // 选区状态(hasSelection/getSelection/clearSelection 是 xterm 方法,桩用可写字段承载)
      hasSelectionFlag: boolean
      selectionText: string
      clearedSelections: number
      // 网格现值(xterm Terminal.cols/rows 只读投影):稳定帧收敛按它与提案比对
      cols: number
      rows: number
      // xterm modes 投影:滚轮分支按 mouseTrackingMode 判定(xterm 默认 'none')
      modes: XtermModesStub
      // xterm.open 后才有的根元素;桩置 null,重放测试注入 dispatchEvent 记录器
      element: { dispatchEvent: (event: unknown) => boolean } | null
    }> = []
    const createdFitAddons: Array<{
      fitCalls: number
      proposed: ProposedDimensions | undefined
    }> = []
    // ResizeObserver 桩实例登记(openTerminal 每终端挂一个;测试取 at(-1))
    const fitObservers: Array<{
      callback: () => void
      observed: unknown[]
      disconnectCalls: number
      trigger: () => void
    }> = []
    // WebGL addon 桩实例登记:用例断言订阅了 onContextLoss,且触发后走 dispose(回退 DOM)
    const createdWebglAddons: Array<{
      contextLossHandlers: Array<() => void>
      disposed: boolean
    }> = []
    // RAF 手动泵:稳定帧循环逐帧推进,测试按帧 flush
    const rafState = { queue: [] as Array<{ id: number; cb: (time: number) => void }>, seq: 0 }
    return {
      onPtyDataHandlers,
      createdTerminals,
      createdFitAddons,
      fitObservers,
      rafState,
      createdWebglAddons
    }
  })

// bridge 桩:泵回调捕获进 onPtyDataHandlers;write 是滚轮分支 2.5(翻页键直达)的观察点
// (vi.fn 自动记录调用,测试前 mockClear 隔离),resize 不被触达,给齐形状即可
vi.mock('../../ipc/bridge', () => ({
  bridge: {
    pty: {
      onPtyData: vi.fn((handler: (event: PumpEvent) => void) => {
        onPtyDataHandlers.push(handler)
        return () => undefined
      }),
      write: vi.fn(async () => undefined),
      resize: vi.fn(async () => undefined)
    },
    state: {
      onChanged: vi.fn(() => () => undefined),
      onNotifyOpen: vi.fn(() => () => undefined)
    }
  }
}))

// xterm 桩:Terminal 记录写入序列与滚轮钩子(被测逻辑的观察点);StableCellFitAddon 桩记录
// fit 调用并提供可配置的 proposeDimensions 提案(稳定帧循环的输入面)。真实 addon 的提案数学
// (device/dpr cell、盒子纯函数)有专测 stable-cell-fit-addon.test.ts,此处只喂提案。
vi.mock('@xterm/xterm', () => ({
  Terminal: class {
    writes: string[] = []
    // T4:write(data, done) 桩形态——投递回调记录在此,由测试手动放行
    writeDoneCallbacks: Array<() => void> = []
    scrolled: number[] = []
    buffer: {
      active: {
        type: 'normal' | 'alternate'
        baseY: number
        getLine: (
          index: number
        ) => { translateToString: (trimRight?: boolean) => string } | undefined
      }
    } = { active: { type: 'normal', baseY: 0, getLine: () => undefined } }
    customWheelHandlers: Array<(event: WheelEvent) => boolean> = []
    customKeyHandlers: Array<(event: KeyboardEvent) => boolean> = []
    // 选区状态(hasSelection/getSelection/clearSelection 是 xterm 方法,桩用可写字段承载)
    hasSelectionFlag = false
    selectionText = ''
    clearedSelections = 0
    cols = 80
    rows = 24
    modes: XtermModesStub = { mouseTrackingMode: 'none' }
    element: { dispatchEvent: (event: unknown) => boolean } | null = null
    // options 对齐真实 xterm 语义:v6 无 applyOptions 方法,运行时更新 = options setter
    // (部分对象逐键合并、对象值按引用比较)。setter 记录每次运行时应用供用例断言;
    // 构造期直赋 _options,不进 appliedOptions
    private _options: Record<string, unknown> = {}
    appliedOptions: Array<Record<string, unknown>> = []
    get options(): Record<string, unknown> {
      return this._options
    }
    set options(next: Record<string, unknown>) {
      this.appliedOptions.push(next)
      Object.assign(this._options, next)
    }
    // 宽度表句柄(xterm proposed API):默认停在 Unicode 6,激活 11 后由用例断言
    // 宽度表句柄(xterm proposed API):默认停在 Unicode 6;register 记录 provider 供用例断言
    registeredUnicodeProviders: UnicodeProviderStub[] = []
    unicode = {
      activeVersion: '6',
      versions: [] as string[],
      register: (provider: UnicodeProviderStub): void => {
        this.registeredUnicodeProviders.push(provider)
        this.unicode.versions.push(provider.version)
      }
    }
    // xterm 私有内核投影:Unicode11Addon 加载后基表注册在 _providers['11'];桩内置最小基表
    // (wcwidth 恒 1、charProperties 原样透传),足够供激活逻辑取用,宽度行为专测在
    // terminal-unicode-provider.test.ts
    _core: { unicodeService?: { _providers?: Record<string, UnicodeProviderStub> } } = {
      unicodeService: {
        _providers: {
          '11': {
            version: '11',
            wcwidth: (_codepoint: number): 0 | 1 | 2 => 1,
            charProperties: (_codepoint: number, preceding: number): number => preceding
          }
        }
      }
    }
    constructor(options: Record<string, unknown>) {
      this._options = options
      createdTerminals.push(this)
    }
    write(data: string, done?: () => void): void {
      this.writes.push(data)
      if (done) {
        this.writeDoneCallbacks.push(done)
      }
    }
    scrollLines(amount: number): void {
      this.scrolled.push(amount)
    }
    // 捕获 attachCustomWheelEventHandler 挂上的 handler,供测试直接调用
    attachCustomWheelEventHandler(handler: (event: WheelEvent) => boolean): void {
      this.customWheelHandlers.push(handler)
    }
    // 捕获按键钩子(复制/中断键位),供测试直接调用
    attachCustomKeyEventHandler(handler: (event: KeyboardEvent) => boolean): void {
      this.customKeyHandlers.push(handler)
    }
    hasSelection(): boolean {
      return this.hasSelectionFlag
    }
    getSelection(): string {
      return this.selectionText
    }
    clearSelection(): void {
      this.clearedSelections += 1
      // 对齐真实 xterm 语义:清选区后 getSelection() 返回空
      this.selectionText = ''
    }
    open(_container: HTMLElement): void {}
    loadAddon(_addon: unknown): void {}
    // T4 可见性接线用例经 activateTerminal 的 RAF 触达:焦点调用桩化(记录调用备断言)
    focusCalls = 0
    focus(): void {
      this.focusCalls += 1
    }
    onData(_listener: (data: string) => void): { dispose: () => void } {
      return { dispose: () => undefined }
    }
    onResize(_listener: (size: { cols: number; rows: number }) => void): { dispose: () => void } {
      return { dispose: () => undefined }
    }
    dispose(): void {}
  }
}))

vi.mock('./stable-cell-fit-addon', () => ({
  StableCellFitAddon: class {
    fitCalls = 0
    proposed: ProposedDimensions | undefined = undefined
    constructor() {
      createdFitAddons.push(this)
    }
    fit(): void {
      this.fitCalls += 1
    }
    proposeDimensions(): ProposedDimensions | undefined {
      return this.proposed
    }
  }
}))

// WebGL addon 桩:真实 addon 在 context loss 后只 fire 事件、不自 dispose,回退 DOM 靠 dispose;
// 桩记录订阅者与 dispose 状态,供「context loss 回退」用例断言
vi.mock('@xterm/addon-webgl', () => ({
  WebglAddon: class {
    contextLossHandlers: Array<() => void> = []
    disposed = false
    constructor() {
      createdWebglAddons.push(this)
    }
    onContextLoss(handler: () => void): void {
      this.contextLossHandlers.push(handler)
    }
    dispose(): void {
      this.disposed = true
    }
  }
}))


// 容器桩:openTerminal 不在容器挂 wheel 监听(滚轮走 terminal 实例上的官方钩子),
// 桩内 xterm.open 为空操作,容器仅作 ResizeObserver.observe 的观察对象身份;
// style 桩供 applyTerminalAppearanceToAll 读 inline display 判定可见性(隐藏终端跳过 fit)
function makeContainerStub(display?: string): HTMLElement {
  return { style: { display: display ?? '' } } as unknown as HTMLElement
}

// 全量设置桩:与 shared/settings-defaults DEFAULT_SETTINGS(渲染层初值与主进程 DEFAULT_STORE.settings 同源)同值
// (spec 数据结构节),单用例只覆盖关注字段
function makeSettings(over: Partial<Settings> = {}): Settings {
  return {
    scrollbackRows: 10000,
    appTheme: 'github-dark',
    terminalTheme: 'Ghostty Default Style Dark',
    shell: 'powershell',
    terminalFontSize: 14,
    terminalFontWeight: 300,
    terminalLineHeight: 1.0,
    terminalCursorStyle: 'block',
    terminalCursorBlink: false,
    ...over
  }
}

// ResizeObserver 桩:登记 observe/disconnect 调用与回调;trigger 手动模拟容器尺寸变化回调
class FakeResizeObserver {
  callback: () => void
  observed: unknown[] = []
  disconnectCalls = 0
  constructor(callback: () => void) {
    this.callback = callback
    fitObservers.push(this)
  }
  observe(target: unknown): void {
    this.observed.push(target)
  }
  disconnect(): void {
    this.disconnectCalls += 1
  }
  trigger(): void {
    this.callback()
  }
}

beforeAll(() => {
  // use-terminal 的运行面:RAF 手动泵 + ResizeObserver 桩(窗口跟随收敛循环)
  vi.stubGlobal('requestAnimationFrame', (cb: (time: number) => void): number => {
    rafState.seq += 1
    rafState.queue.push({ id: rafState.seq, cb })
    return rafState.seq
  })
  vi.stubGlobal('cancelAnimationFrame', (id: number): void => {
    rafState.queue = rafState.queue.filter((frame) => frame.id !== id)
  })
  vi.stubGlobal('ResizeObserver', FakeResizeObserver)
  // WheelEvent 桩:重放克隆经 new WheelEvent(type, init) 构造(node 无此全局);形状 = init 面拷贝
  vi.stubGlobal(
    'WheelEvent',
    class FakeWheelEvent {
      type: string
      constructor(type: string, init: WheelEventInit) {
        this.type = type
        Object.assign(this, init)
      }
    }
  )
})

beforeEach(() => {
  rafState.queue = [] // 帧队列逐测试隔离,防上一用例的循环帧泄漏
  resetWritePumpLoop() // 泵帧记账与被清空的帧队列同步(调度器消费循环的显式起点)
  vi.mocked(bridge.pty.write).mockClear() // PTY 写入记录逐测试隔离:翻页键守卫只看本用例的 write
})

afterAll(() => {
  vi.unstubAllGlobals()
})

// 按帧推进:消费当前待决帧一次(循环体内新排的帧留待下一次调用,一调用 = 一帧)
function flushAnimationFrame(): void {
  const pending = rafState.queue
  rafState.queue = []
  for (const frame of pending) {
    frame.cb(0)
  }
}

// 排空调度器(T4):逐帧 pump,每帧后手动放行 write 回调(真实 xterm 解析完才回调,桩由
// 测试放行),直到无待决帧——大量积压数据受帧预算约束需多帧消费,助手代劳逐帧推进
function drainScheduler(terminal: (typeof createdTerminals)[number]): void {
  for (let guard = 0; rafState.queue.length > 0 && guard < 1000; guard += 1) {
    flushAnimationFrame()
    for (const done of terminal.writeDoneCallbacks.splice(0)) {
      done()
    }
  }
}

// 开终端并消化首帧 fit(openTerminal 的首帧 RAF),测试从空队列、零 fit 基线开始
function openSettledTerminal(sessionId: string): {
  container: HTMLElement
  fitAddon: (typeof createdFitAddons)[number]
  observer: (typeof fitObservers)[number]
  terminal: (typeof createdTerminals)[number]
} {
  const container = makeContainerStub()
  openTerminal(sessionId, 10000, makeSettings(), container)
  flushAnimationFrame()
  const fitAddon = createdFitAddons.at(-1)!
  fitAddon.fitCalls = 0
  const observer = fitObservers.at(-1)!
  expect(observer, 'openTerminal 应对 container 挂 ResizeObserver').toBeDefined()
  return { container, fitAddon, observer, terminal: createdTerminals.at(-1)! }
}

describe('use-terminal 复制/中断键位(Windows Terminal 惯例)', () => {
  const key = (over: Partial<Record<'key' | 'shiftKey', unknown>> = {}): KeyboardEvent =>
    ({ type: 'keydown', key: 'c', ctrlKey: true, shiftKey: false, altKey: false, ...over }) as KeyboardEvent

  function stubClipboard(): ReturnType<typeof vi.fn> {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true
    })
    return writeText
  }

  // 每次唯一会话 id:计数类桩字段(clearedSelections 等)跨用例共享终端会累计,须隔离
  let copySeq = 0
  function openCopyTerminal(hasSelection: boolean, selectionText?: string) {
    const id = `s-copy-${++copySeq}`
    openTerminal(id, 10000, makeSettings(), makeContainerStub())
    const terminal = createdTerminals.at(-1)!
    terminal.hasSelectionFlag = hasSelection
    // 状态配对对齐真实 xterm:无选区时 getSelection() 也为空
    terminal.selectionText = selectionText ?? (hasSelection ? 'picked-text' : '')
    const handler = terminal.customKeyHandlers.at(-1)!
    return { terminal, handler }
  }

  it('有选区 Ctrl+C → 复制并清选区,消费事件(false,不发中断)', () => {
    const writeText = stubClipboard()
    const { terminal, handler } = openCopyTerminal(true)
    expect(handler(key())).toBe(false)
    expect(writeText).toHaveBeenCalledWith('picked-text')
    expect(terminal.clearedSelections).toBe(1)
  })

  it('无选区 Ctrl+C → 放行(true,照发中断信号),不碰剪贴板', () => {
    const writeText = stubClipboard()
    const { handler } = openCopyTerminal(false)
    expect(handler(key())).toBe(true)
    expect(writeText).not.toHaveBeenCalled()
  })

  it('Ctrl+Shift+C → 一律消费;有选区复制,无选区不写', () => {
    const writeText = stubClipboard()
    const { terminal, handler } = openCopyTerminal(true)
    expect(handler(key({ shiftKey: true }))).toBe(false)
    expect(writeText).toHaveBeenCalledWith('picked-text')
    expect(terminal.clearedSelections).toBe(1)
    const bare = openCopyTerminal(false)
    expect(bare.handler(key({ shiftKey: true }))).toBe(false)
    expect(writeText).toHaveBeenCalledTimes(1) // 无选区:不写剪贴板
  })

  it('非目标键放行(Ctrl+X / 非keydown 事件)', () => {
    stubClipboard()
    const { handler } = openCopyTerminal(true)
    expect(handler(key({ key: 'x' }))).toBe(true)
    expect(handler({ type: 'keyup', key: 'c', ctrlKey: true, shiftKey: false, altKey: false } as KeyboardEvent)).toBe(true)
  })
})

describe('use-terminal 数据泵(Fix-2 守卫 + T4 调度器迁移)', () => {
  it('T4 用例6 先到先存、注册即放:未注册 id 的 pty:data 入队不丢,openTerminal 后按入队序落写入序列首部,之后照常消费', () => {
    // 先开再关一个引导终端:确保数据泵已挂(dataBusBound 幂等),拿到泵回调
    openTerminal('s-boot', 10000, makeSettings(), makeContainerStub())
    closeTerminal('s-boot')
    const pump = onPtyDataHandlers[0]
    expect(pump, '数据泵应随首次 openTerminal 挂上').toBeDefined()

    // spawn 与注册之间的丢失窗口:数据先到,id 尚未注册(默认不可见,只入队)
    pump!({ sessionId: 's-early', data: 'BANNER-1' })
    pump!({ sessionId: 's-early', data: 'BANNER-2' })

    openTerminal('s-early', 10000, makeSettings(), makeContainerStub())
    const terminal = createdTerminals.at(-1)!
    // 注册即放(T4):注册转可见,下一帧泵按入队序消费;断言与迁移前一致(内容/顺序不变)
    flushAnimationFrame()
    expect(terminal.writes.join('')).toBe('BANNER-1BANNER-2')

    // 注册后的数据照常消费,顺序接在 flush 之后
    pump!({ sessionId: 's-early', data: 'LIVE' })
    flushAnimationFrame()
    expect(terminal.writes.join('')).toBe('BANNER-1BANNER-2LIVE')

    closeTerminal('s-early')
  })

  // 上限守卫(原 D6 暂存袋 → T4 队列上限迁移):进程输出但画布永不出现的退化路径内存有界,
  // 超限丢最旧、保最新画面;调度器内部的丢最旧规则已在其函数级测试穷尽,此处验证接线后的总量
  it('队列上限:累计超 4MB 丢最旧,注册后只消费上限内最新内容', () => {
    openTerminal('s-boot', 10000, makeSettings(), makeContainerStub())
    closeTerminal('s-boot')
    const pump = onPtyDataHandlers[0]!
    // 三块各 200 万字符 = 600 万 > 队列上限 4,194,304(WRITE_QUEUE_LIMIT_CHARS)→ 丢最旧一块
    const chunk = (marker: string): string => marker + 'x'.repeat(2_000_000 - marker.length)
    pump({ sessionId: 's-cap', data: chunk('MARK-1-') })
    pump({ sessionId: 's-cap', data: chunk('MARK-2-') })
    pump({ sessionId: 's-cap', data: chunk('MARK-3-') })
    openTerminal('s-cap', 10000, makeSettings(), makeContainerStub())
    const terminal = createdTerminals.at(-1)!
    drainScheduler(terminal)
    const flushed = terminal.writes.join('')
    // 丢最旧:只剩最新两块,总量恰 400 万字符且收敛在上限内
    expect(flushed.length).toBe(4_000_000)
    expect(flushed.length).toBeLessThanOrEqual(WRITE_QUEUE_LIMIT_CHARS)
    expect(flushed.startsWith('MARK-2-'), '队首块被丢,留存自第二块起').toBe(true)
    expect(flushed.includes('MARK-1-'), '被丢的队首不再出现').toBe(false)
    expect(flushed.includes('MARK-3-'), '队尾块完整保留').toBe(true)
    closeTerminal('s-cap')
  })

  it('tab 关闭清理队列(T4 用例9):关闭前暂存随 close 清空不串台;关闭后到达的数据入队不消费', () => {
    // 引导终端:数据泵随首次 openTerminal 挂一次(幂等)。自带引导,不依赖上一用例先跑过——
    // Why: 用例顺序独立才可靠,否则 shuffle/单用例过滤时 onPtyDataHandlers 为空(pump 是 undefined)
    openTerminal('s-boot', 10000, makeSettings(), makeContainerStub())
    closeTerminal('s-boot')
    const pump = onPtyDataHandlers[0]!
    expect(pump, '数据泵应随首次 openTerminal 挂上').toBeDefined()

    // 关闭前暂存的数据:closeTerminal 的 remove 连队列一并清空,不得串到此后新开的终端
    pump({ sessionId: 's-stale', data: 'STALE-OUT' })
    closeTerminal('s-stale') // 未注册过的 id 也走清理路径
    openTerminal('s-stale', 10000, makeSettings(), makeContainerStub())
    let terminal = createdTerminals.at(-1)!
    flushAnimationFrame()
    expect(terminal.writes.join('')).toBe('')
    closeTerminal('s-stale')

    // 关闭后到达的数据(T4 用例9):remove 后再入队不消费——与任何未注册会话同一条路,
    // 挂在自身队列上有界存放(无泄漏);既有的 pendingData 旁路在重开时同样会 flush 此类数据,
    // 对外行为兼容(spec「数据泵对外行为兼容」),故重开后按注册即放消费,这里只断言关闭期不消费
    pump({ sessionId: 's-stale', data: 'LATE-DATA' })
    openTerminal('s-stale', 10000, makeSettings(), makeContainerStub())
    terminal = createdTerminals.at(-1)!
    flushAnimationFrame()
    expect(terminal.writes.join(''), '与既有暂存袋行为一致:重开(注册)即放').toBe('LATE-DATA')
    closeTerminal('s-stale')
  })

  it('T4 接线·可见性切换:切走标签的会话只入队不消费,activateTerminal 切回后一帧消费积压', () => {
    const a = openSettledTerminal('s-vis-a')
    openSettledTerminal('s-vis-b')
    activateTerminal('s-vis-b') // 激活 B:B 唯一可见,A 转隐藏只缓冲
    flushAnimationFrame()

    const pump = onPtyDataHandlers[0]!
    pump({ sessionId: 's-vis-a', data: 'BG-DATA' })
    flushAnimationFrame()
    expect(a.terminal.writes.join(''), '隐藏会话:零喂入').toBe('')

    activateTerminal('s-vis-a') // 切回 A:转可见解锁积压
    flushAnimationFrame()
    expect(a.terminal.writes.join(''), '切回后一帧内渐进消费').toBe('BG-DATA')

    closeTerminal('s-vis-a')
    closeTerminal('s-vis-b')
  })

  it('T4 评审发现1·预览失活路径:active 翻 false(不经 activateTerminal)落闸只缓冲,重新激活消费恢复', () => {
    // 场景:预览打开把全部 active 置 false,TerminalView 激活 effect 的 if (active) 对任何
    // 终端都不触发——原激活终端旗标滞留 true,隐藏 xterm 持续被喂入(评审 Important)
    const a = openSettledTerminal('s-preview')
    activateTerminal('s-preview')
    flushAnimationFrame()

    // 失活分支(TerminalView active→false):不经 activateTerminal 的隐藏路径也必须停喂
    setTerminalVisible('s-preview', false)
    const pump = onPtyDataHandlers[0]!
    pump({ sessionId: 's-preview', data: 'PREVIEW-BG' })
    flushAnimationFrame()
    expect(a.terminal.writes.join(''), '失活(预览隐藏)终端:零喂入只缓冲').toBe('')

    // 关预览重新激活:转可见解锁积压,消费恢复
    activateTerminal('s-preview')
    flushAnimationFrame()
    expect(a.terminal.writes.join(''), '重新激活后消费恢复').toBe('PREVIEW-BG')

    closeTerminal('s-preview')
  })
})

describe('use-terminal 字体度量(Orca 对齐)', () => {
  it('Terminal 选项使用 Orca 字体族/字号/字重,避免 canvas 测量与 DOM 渲染度量不一致', () => {
    openTerminal('s-font', 10000, makeSettings(), makeContainerStub())
    const terminal = createdTerminals.at(-1)!

    expect(terminal.options.fontFamily, '应显式指定 Orca 字体族').toContain('Cascadia Mono')
    expect(terminal.options.fontSize, '字号应与 Orca 一致').toBe(14)
    // 字重来源改为解析输出(T3/T5):数值 300/500,与迁移前字符串 '300'/'500' 语义等价
    // (xterm FontWeight = 'normal' | 'bold' | number);字体族与度量的单一来源是 shared/themes
    expect(terminal.options.fontWeight, '常规字重应与 Orca 一致').toBe(300)
    expect(terminal.options.fontWeightBold, '粗体字重应与 Orca 一致').toBe(500)

    closeTerminal('s-font')
  })
})
describe('use-terminal 终端外观接线(T5:applyTerminalAppearanceToAll)', () => {
  it('两个已开终端:options 运行时应用均被调且值来自解析输出,fit 路径经既有收敛循环触发', () => {
    openSettledTerminal('s-apply-a')
    openSettledTerminal('s-apply-b')
    const terminalA = createdTerminals.at(-2)!
    const terminalB = createdTerminals.at(-1)!
    const fitA = createdFitAddons.at(-2)!
    const fitB = createdFitAddons.at(-1)!

    // 字体选具体项:解析输出 = 该字体插链首(链内容本身 T3 函数级已穷尽,此处只断接线来源)
    const settings = makeSettings({ terminalFontSize: 20, terminalFontFamily: 'JetBrains Mono' })
    applyTerminalAppearanceToAll(settings)
    const expected = resolveTerminalAppearance(settings)

    // 期望值来源(spec 接缝五):两实例均被调,值 = 解析函数输出,不是任何本地常量
    expect(terminalA.appliedOptions.length, '终端 A 应收到一次运行时应用').toBe(1)
    expect(terminalB.appliedOptions.length, '终端 B 应收到一次运行时应用').toBe(1)
    for (const applied of [...terminalA.appliedOptions, ...terminalB.appliedOptions]) {
      expect(applied.fontFamily, '字体链来自解析输出').toBe(expected.fontFamily)
      expect(applied.fontFamily).toContain('JetBrains Mono')
      expect(applied.fontSize, '字号来自解析输出').toBe(20)
    }

    // fit 路径触发:度量变更 → 既有 RAF 稳定帧收敛循环,提案未定 → 首帧收敛 fit 恰一次
    flushAnimationFrame()
    expect(fitA.fitCalls).toBe(1)
    expect(fitB.fitCalls).toBe(1)
    expect(rafState.queue.length).toBe(0)

    closeTerminal('s-apply-a')
    closeTerminal('s-apply-b')
  })
})

describe('use-terminal 外观应用换主题(T-R5 用例 3:终端主题单槽)', () => {
  it('设置改 terminalTheme 后 applyToAll 把已开终端的配色换成新主题', () => {
    openSettledTerminal('s-slot-a')
    const terminal = createdTerminals.at(-1)!

    // 初始默认深色主题:开终端时已按解析输出落一次
    expect(terminal.options.theme, '开终端时已按解析输出落默认主题').toBe(
      TERMINAL_THEMES['Ghostty Default Style Dark']
    )

    // 换成另一套仍在 22 套目录内的主题:单槽直选,不再有系统深浅维度
    const settings = makeSettings({ terminalTheme: 'Tango Dark' })
    applyTerminalAppearanceToAll(settings)
    expect(terminal.appliedOptions.at(-1)?.theme, 'applyToAll 应换成新选的终端主题').toBe(
      TERMINAL_THEMES['Tango Dark']
    )

    closeTerminal('s-slot-a')
  })
})

describe('隐藏终端的 fit 守卫(终审 P1-2)', () => {
  it('display:none 的容器不 fit、不发 spawn 就绪回调;可见容器照旧 fit', () => {
    // 隐藏容器:首帧 fit 必须被守卫挡掉——否则 0 尺寸盒被 StableCellFitAddon 提案成 2×1,
    // fit 会把 2×1 当真实尺寸并经 onResize → pty.resize 打到后台 agent
    openTerminal('s-hidden', 10000, makeSettings(), makeContainerStub('none'))
    const hiddenFit = createdFitAddons.at(-1)!
    flushAnimationFrame()
    expect(hiddenFit.fitCalls, '隐藏终端首帧不得 fit').toBe(0)

    // 隐藏终端的外观应用同样跳过 fit(与 applyTerminalAppearanceToAll 的既有守卫同口径)
    applyTerminalAppearanceToAll(makeSettings({ terminalFontSize: 20 }))
    flushAnimationFrame()
    expect(hiddenFit.fitCalls, '隐藏终端的外观应用也不得 fit').toBe(0)
    closeTerminal('s-hidden')

    // 可见容器:守卫不得把正常路径一起挡掉
    openTerminal('s-visible', 10000, makeSettings(), makeContainerStub())
    const visibleFit = createdFitAddons.at(-1)!
    flushAnimationFrame()
    expect(visibleFit.fitCalls, '可见终端首帧应 fit 一次').toBe(1)
    closeTerminal('s-visible')
  })
})

describe('use-terminal 创建期外观来自设置(T5 用例 2)', () => {
  it('openTerminal 传入 fontSize=20 的设置:新实例 options 取解析输出而非本地常量', () => {
    openTerminal('s-from-settings', 10000, makeSettings({ terminalFontSize: 20 }), makeContainerStub())
    const terminal = createdTerminals.at(-1)!

    // 期望值来源(手算 + spec 接缝五):字号直通设置值;字体链为解析链(含默认回退链首项)
    expect(terminal.options.fontSize).toBe(20)
    expect(terminal.options.fontFamily).toBe(DEFAULT_FONT_FALLBACK_CHAIN)

    closeTerminal('s-from-settings')
  })
})

describe('use-terminal 宽字符宽度表(RGI 对齐)', () => {
  it('开启 allowProposedApi 并激活 11-rgi provider:VS16/ZWJ emoji 序列按 pi 的 RGI 口径计 2 格', () => {
    openTerminal('s-unicode', 10000, makeSettings(), makeContainerStub())
    const terminal = createdTerminals.at(-1)!

    // 期望值来源(真实 xterm + pi bundle 探针,非按实现推导):xterm 6.1.0-beta.336 内置宽度表
    // 只有 '6'(✅/❌ 算 1),而 agent CLI 按 Unicode 9+ 排版算 2 → 含 emoji 行少占一格、右边框错位。
    // '11' 基表补齐 ✅/❌,但 ➡️(U+27A1+FE0F)等「窄基码+VS16」序列基表仍算 1 格、pi 按 RGI
    // emoji 算 2 → 行内每差一格,pi 行尾自绘滚动条左移一格;故激活 11-rgi 自定义 provider。
    expect(terminal.options.allowProposedApi, 'unicode 是 proposed API,必须开启').toBe(true)
    expect(terminal.unicode.activeVersion, '应激活 RGI 对齐宽度表').toBe('11-rgi')
    expect(
      terminal.registeredUnicodeProviders.map((provider) => provider.version),
      '自定义 provider 应注册进 unicode 表'
    ).toContain('11-rgi')

    closeTerminal('s-unicode')
  })
})
describe('use-terminal WebGL context loss 回退', () => {
  it('GPU 上下文丢失时 dispose addon:dispose 内部 setRenderer(DOM),终端不白屏冻结', () => {
    openTerminal('s-webgl', 10000, makeSettings(), makeContainerStub())
    const addon = createdWebglAddons.at(-1)!

    // 期望值来源(@xterm/addon-webgl 0.20.0-beta.329 源码):webglcontextlost 后 3 秒未恢复
    // 只 fire onContextLoss,不自行 dispose;回退 DOM renderer 发生在 dispose 回调里。
    // 故必须有人订阅并 dispose,否则终端停在失效渲染器上。
    expect(addon.contextLossHandlers.length, '应订阅 onContextLoss').toBe(1)

    addon.contextLossHandlers[0]!()

    expect(addon.disposed, 'context loss 后应 dispose 以回退 DOM renderer').toBe(true)

    closeTerminal('s-webgl')
  })
})
describe('use-terminal 窗口跟随(ResizeObserver + RAF 稳定帧收敛)', () => {
  it('observer 观察 container;触发后 RAF 循环等布局稳定,收敛时 fit 恰一次并退出', () => {
    const { container, fitAddon, observer } = openSettledTerminal('s-fit')
    expect(observer.observed, '观察对象应是 openTerminal 传入的 container').toEqual([container])

    // 窗口拖大 → 容器变化 → RO 回调;新尺寸在下一帧才落进提案(模拟重排延迟)
    observer.trigger()
    fitAddon.proposed = { cols: 120, rows: 40 }
    flushAnimationFrame() // 帧 1:提案 ≠ 触发时提案,≠ terminal 现值 → 继续等
    expect(fitAddon.fitCalls).toBe(0)
    flushAnimationFrame() // 帧 2:提案与上一帧相同 → 收敛 → fit
    expect(fitAddon.fitCalls).toBe(1)
    flushAnimationFrame()
    expect(fitAddon.fitCalls).toBe(1) // 收敛即退出,无残留循环
    expect(rafState.queue.length).toBe(0)
    closeTerminal('s-fit')
  })

  it('提出尺寸与 terminal 现值一致:单帧收敛即 fit', () => {
    const { fitAddon, observer } = openSettledTerminal('s-fit-eq')
    fitAddon.proposed = { cols: 80, rows: 24 } // = terminal 现值(80x24)
    observer.trigger()
    flushAnimationFrame()
    expect(fitAddon.fitCalls).toBe(1)
    expect(rafState.queue.length).toBe(0)
    closeTerminal('s-fit-eq')
  })

  it('高频振荡(每帧提案都不同):满 8 帧兜底 fit 一次并退出,防振荡不止', () => {
    const { fitAddon, observer } = openSettledTerminal('s-fit-osc')
    observer.trigger()
    let flip = false
    for (let frame = 0; frame < 10; frame += 1) {
      fitAddon.proposed = flip ? { cols: 120, rows: 40 } : { cols: 121, rows: 41 }
      flip = !flip
      flushAnimationFrame()
    }
    expect(fitAddon.fitCalls, '满 MAX_STABILITY_FRAMES 帧必须兜底收敛').toBe(1)
    expect(rafState.queue.length).toBe(0)
    closeTerminal('s-fit-osc')
  })

  it('连续触发 observer:合并进同一循环,待决帧不叠加', () => {
    const { fitAddon, observer } = openSettledTerminal('s-fit-co')
    fitAddon.proposed = { cols: 120, rows: 40 }
    observer.trigger()
    observer.trigger()
    observer.trigger()
    expect(rafState.queue.length).toBe(1) // 循环已在跑:重复触发合并,不另排帧
    flushAnimationFrame()
    flushAnimationFrame()
    expect(fitAddon.fitCalls).toBe(1)
    closeTerminal('s-fit-co')
  })

  it('closeTerminal:observer.disconnect 被调,待决 fit 帧被撤销,循环不再推进', () => {
    const { fitAddon, observer } = openSettledTerminal('s-fit-close')
    fitAddon.proposed = { cols: 120, rows: 40 }
    observer.trigger()
    expect(rafState.queue.length).toBe(1)
    closeTerminal('s-fit-close')
    expect(observer.disconnectCalls).toBe(1)
    flushAnimationFrame()
    flushAnimationFrame()
    expect(fitAddon.fitCalls).toBe(0) // 待决帧已撤销:关闭后不再 fit
    expect(rafState.queue.length).toBe(0)
  })
})

// 合成滚轮事件桩:滚轮 handler 只消费 shiftKey 与 deltaY(钩子的输入面)
function makeWheelEvent(init: { deltaY: number; shiftKey?: boolean }): WheelEvent {
  return { deltaY: init.deltaY, shiftKey: init.shiftKey ?? false } as WheelEvent
}

describe('use-terminal Shift+滚轮本地滚动(ADR-0004:attachCustomWheelEventHandler 钩子)', () => {
  function openWithWheelHandler(sessionId: string): {
    terminal: (typeof createdTerminals)[number]
    handleWheel: CustomWheelHandler
  } {
    openTerminal(sessionId, 10000, makeSettings(), makeContainerStub())
    const terminal = createdTerminals.at(-1)!
    const handleWheel = terminal.customWheelHandlers.at(-1)!
    expect(handleWheel, 'openTerminal 应经 attachCustomWheelEventHandler 挂上钩子').toBeDefined()
    return { terminal, handleWheel }
  }

  it('Shift+滚轮:scrollLines 以 Math.sign(deltaY)*3 调用且 handler 返回 false(拦掉 xterm 默认)', () => {
    const { terminal, handleWheel } = openWithWheelHandler('s-wheel')
    expect(terminal.scrolled, '开终端即挂钩子,但初始无滚动').toEqual([])

    // Shift+滚轮向下(deltaY>0):xterm typings「scrollLines 正值 = 向下滚(负值向上)」,
    // 与滚轮方向同向 → +3(3 行为约定幅度)
    expect(handleWheel(makeWheelEvent({ deltaY: 120, shiftKey: true }))).toBe(false)
    expect(terminal.scrolled).toEqual([3])

    // 反向:deltaY<0 → -3(向上翻 scrollback)
    expect(handleWheel(makeWheelEvent({ deltaY: -120, shiftKey: true }))).toBe(false)
    expect(terminal.scrolled).toEqual([3, -3])
    closeTerminal('s-wheel')
  })

  it('无 Shift + normal buffer:handler 返回 true、无 scrollLines——交 xterm 默认', () => {
    const { terminal, handleWheel } = openWithWheelHandler('s-wheel-default')

    // normal buffer + 非 mouse mode:滚轮交 xterm 默认(滚 scrollback viewport),不本地拦;
    // 交替屏接管已收窄进分支 2.5(见滚轮四分支 describe),normal buffer 仍走 xterm 默认
    expect(handleWheel(makeWheelEvent({ deltaY: 120 }))).toBe(true)
    expect(terminal.scrolled).toEqual([])
    closeTerminal('s-wheel-default')
  })
})

describe('use-terminal 滚轮四分支(T3.5:Shift 本地滚 / mouse mode 放大重放 / alt buffer 转翻页键 / xterm 默认)', () => {
  function openWithReplay(sessionId: string): {
    terminal: (typeof createdTerminals)[number]
    handleWheel: CustomWheelHandler
    dispatched: Array<WheelEvent & { deltaY: number; deltaMode: number }>
  } {
    openTerminal(sessionId, 10000, makeSettings(), makeContainerStub())
    const terminal = createdTerminals.at(-1)!
    const handleWheel = terminal.customWheelHandlers.at(-1)!
    expect(handleWheel, 'openTerminal 应经 attachCustomWheelEventHandler 挂上钩子').toBeDefined()
    const dispatched: Array<WheelEvent & { deltaY: number; deltaMode: number }> = []
    terminal.element = {
      dispatchEvent: (event: unknown) => {
        dispatched.push(event as WheelEvent & { deltaY: number; deltaMode: number })
        return true
      }
    }
    return { terminal, handleWheel, dispatched }
  }

  it('分支 1 优先:mouse mode 下 Shift+滚轮仍走本地 scrollLines,不放大不重放', () => {
    const { terminal, handleWheel, dispatched } = openWithReplay('s-w3-shift')
    terminal.modes.mouseTrackingMode = 'drag'
    expect(handleWheel(makeWheelEvent({ deltaY: 120, shiftKey: true }))).toBe(false)
    expect(terminal.scrolled).toEqual([3])
    expect(dispatched).toEqual([])
    closeTerminal('s-w3-shift')
  })

  it('分支 1 守卫:Shift + 水平滚轮(deltaY=0)→ 返回 true、无 scrollLines、无重放——交 xterm 默认', () => {
    const { terminal, handleWheel, dispatched } = openWithReplay('s-w3-shift-horiz')
    // 非 mouse mode:Shift + deltaY=0 不进分支 1(本地滚只认垂直滚),直落分支 3 交 xterm 默认
    // (xterm 对水平滚轮有自己的处理路径,handler 白吞会剥夺该路径)
    expect(handleWheel(makeWheelEvent({ deltaY: 0, shiftKey: true }))).toBe(true)
    expect(terminal.scrolled).toEqual([])

    // mouse mode 下同样不得进分支 1 / 分支 2(shouldReplay 同判 deltaY≠0):
    // 变异点 = 去掉 && event.deltaY !== 0 → 此处 scrollLines(Math.sign(0)*3) no-op 仍返回 false
    terminal.modes.mouseTrackingMode = 'drag'
    expect(handleWheel(makeWheelEvent({ deltaY: 0, shiftKey: true }))).toBe(true)
    expect(terminal.scrolled).toEqual([])
    expect(dispatched).toEqual([])
    closeTerminal('s-w3-shift-horiz')
  })

  it('分支 2:无 Shift + mouse mode → 返回 false,按距离解析 N 个 line-mode 克隆重放(方向归一 ±1)', async () => {
    const { terminal, handleWheel, dispatched } = openWithReplay('s-w3-replay')
    terminal.modes.mouseTrackingMode = 'drag'
    // 桩事件无 wheelDelta/timeStamp → 连续型距离路径:|120|px ÷ 16px/行 = 7.5 → 7 个报告
    expect(handleWheel(makeWheelEvent({ deltaY: 120 }))).toBe(false)
    await Promise.resolve() // 重放经 queueMicrotask 排空
    expect(dispatched.length).toBe(7)
    for (const clone of dispatched) {
      expect(clone.deltaMode).toBe(1) // DOM_DELTA_LINE
      expect(clone.deltaY).toBe(1) // deltaY>0 → 归一 +1(向下)
    }
    closeTerminal('s-w3-replay')
  })

  it('分支 2 反向:deltaY<0 → 克隆 deltaY=-1(向上)', async () => {
    const { terminal, handleWheel, dispatched } = openWithReplay('s-w3-up')
    terminal.modes.mouseTrackingMode = 'any'
    expect(handleWheel(makeWheelEvent({ deltaY: -120 }))).toBe(false)
    await Promise.resolve()
    expect(dispatched.length).toBe(7)
    for (const clone of dispatched) {
      expect(clone.deltaY).toBe(-1)
    }
    closeTerminal('s-w3-up')
  })

  it('重放克隆再入 handler:识别为重放,返回 true 交 xterm 内建 mouse 路径(防放大递归)', async () => {
    const { terminal, handleWheel, dispatched } = openWithReplay('s-w3-clone')
    terminal.modes.mouseTrackingMode = 'drag'
    expect(handleWheel(makeWheelEvent({ deltaY: 120 }))).toBe(false)
    await Promise.resolve()
    expect(dispatched.length).toBe(7)
    expect(handleWheel(dispatched[0]!)).toBe(true) // 落分支 3:克隆交 xterm 默认转报告
    await Promise.resolve()
    expect(dispatched.length, '克隆不再被放大').toBe(7)
    closeTerminal('s-w3-clone')
  })

  // 分支 2.5 守卫(评审期第五项修复):交替屏 + 非 mouse mode → 滚轮转翻页键直达 PTY。
  // 证据链:Windows ConPTY 不透传鼠标模式序列(?1000/?1002/?1006 实测被吞),pi 运行在交替屏
  // (?1049h)时 xterm 端 mouseTrackingMode 恒 none,滚轮报告发不出去;而 pi 把 PageUp/PageDown
  // 绑定为滚自己的历史视图(pi 源码 tui.altScreen.pageUp/pageDown),翻页键序列经 ConPTY 实测
  // 正常直达——滚轮转翻页键:deltaY<0(向上滚)→ PageUp(\x1b[5~),deltaY>0 → PageDown(\x1b[6~)。
  it('分支 2.5:alt buffer + 非 mouse mode + deltaY<0 → 写 PageUp(\\x1b[5~)给 PTY,返回 false,不本地滚不重放', () => {
    const { terminal, handleWheel, dispatched } = openWithReplay('s-w4-alt-up')
    // ConPTY 实况:pi 在交替屏收不到鼠标模式,桩的 mouseTrackingMode 保持默认 'none'
    terminal.buffer.active.type = 'alternate'
    expect(handleWheel(makeWheelEvent({ deltaY: -100 }))).toBe(false)
    expect(vi.mocked(bridge.pty.write).mock.calls.map((call) => call[0].data)).toEqual(['\x1b[5~'])
    expect(terminal.scrolled).toEqual([])
    expect(dispatched).toEqual([])
    closeTerminal('s-w4-alt-up')
  })

  it('分支 2.5 反向:alt buffer + 非 mouse mode + deltaY>0 → 写 PageDown(\\x1b[6~)给 PTY', () => {
    const { terminal, handleWheel, dispatched } = openWithReplay('s-w4-alt-down')
    terminal.buffer.active.type = 'alternate'
    expect(handleWheel(makeWheelEvent({ deltaY: 100 }))).toBe(false)
    expect(vi.mocked(bridge.pty.write).mock.calls.map((call) => call[0].data)).toEqual(['\x1b[6~'])
    expect(terminal.scrolled).toEqual([])
    expect(dispatched).toEqual([])
    closeTerminal('s-w4-alt-down')
  })

  it('分支 2.5 守卫:非 mouse mode + normal buffer → 仍交 xterm 默认(return true),不写翻页键——只在交替屏接管', () => {
    const { terminal, handleWheel, dispatched } = openWithReplay('s-w4-normal')
    terminal.buffer.active.type = 'normal'
    expect(handleWheel(makeWheelEvent({ deltaY: 100 }))).toBe(true)
    expect(vi.mocked(bridge.pty.write).mock.calls).toEqual([])
    expect(terminal.scrolled).toEqual([])
    expect(dispatched).toEqual([])
    closeTerminal('s-w4-normal')
  })

  it('分支 3:无 Shift + 非 mouse mode(none)→ 返回 true,不放大不重放', () => {
    const { terminal, handleWheel, dispatched } = openWithReplay('s-w3-default')
    // terminal.modes.mouseTrackingMode 默认 'none'
    expect(handleWheel(makeWheelEvent({ deltaY: 120 }))).toBe(true)
    expect(terminal.scrolled).toEqual([])
    expect(dispatched).toEqual([])
    closeTerminal('s-w3-default')
  })
})


describe('use-terminal 幂等短路(D12:无关 settings 变更不重放终端)', () => {
  it('解析结果未变的重复应用零动作,外观真变后恢复应用', () => {
    openSettledTerminal('s-d12')
    const terminal = createdTerminals.at(-1)!
    const base = makeSettings()
    resetAppliedAppearanceCache() // 明确起点:视为外观尚未应用过
    applyTerminalAppearanceToAll(base)
    const afterFirst = terminal.appliedOptions.length
    expect(afterFirst, '首次应用应生效').toBeGreaterThanOrEqual(1)
    applyTerminalAppearanceToAll(base) // 同值重放:短路,零动作
    expect(terminal.appliedOptions.length, '同值重放不得重写终端').toBe(afterFirst)
    applyTerminalAppearanceToAll(makeSettings({ terminalFontSize: 26 })) // 外观真变:恢复应用
    expect(terminal.appliedOptions.length, '外观变化后应再次应用').toBe(afterFirst + 1)
    closeTerminal('s-d12')
  })
})
