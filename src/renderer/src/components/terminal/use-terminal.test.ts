// Fix-2 守卫:pty:data 早于 xterm 注册到达时「先到先存、注册即放」,启动输出不丢
// 落法:use-terminal 是渲染层模块,node 环境下对其 import 面(bridge = window.api、
// @xterm/xterm、@xterm/addon-fit)与 window/rAF 全局打桩;数据泵暂存与 openTerminal
// flush 逻辑本体不 mock,断言打在 Terminal 写入序列上(环境桩不碰被测逻辑)
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { closeTerminal, openTerminal } from './use-terminal'

interface PumpEvent {
  sessionId: string
  data: string
}

// vi.hoisted:供 mock 工厂捕获泵回调与 xterm 写入序列(工厂先于测试文件体执行,防 TDZ)
const { onPtyDataHandlers, createdTerminals } = vi.hoisted(() => {
  const onPtyDataHandlers: Array<(event: PumpEvent) => void> = []
  const createdTerminals: Array<{ writes: string[] }> = []
  return { onPtyDataHandlers, createdTerminals }
})

// bridge 桩:泵回调捕获进 onPtyDataHandlers;write/resize 不被本守卫触达,给齐形状即可
vi.mock('../../ipc/bridge', () => ({
  bridge: {
    pty: {
      onPtyData: vi.fn((handler: (event: PumpEvent) => void) => {
        onPtyDataHandlers.push(handler)
        return () => undefined
      }),
      write: vi.fn(async () => undefined),
      resize: vi.fn(async () => undefined)
    }
  }
}))

// xterm 桩:Terminal 记录写入序列(被测逻辑的观察点);FitAddon 只需 fit 可调
vi.mock('@xterm/xterm', () => ({
  Terminal: class {
    writes: string[] = []
    constructor() {
      createdTerminals.push(this)
    }
    write(data: string): void {
      this.writes.push(data)
    }
    open(_container: HTMLElement): void {}
    loadAddon(_addon: unknown): void {}
    onData(_listener: (data: string) => void): { dispose: () => void } {
      return { dispose: () => undefined }
    }
    onResize(_listener: (size: { cols: number; rows: number }) => void): { dispose: () => void } {
      return { dispose: () => undefined }
    }
    dispose(): void {}
  }
}))

vi.mock('@xterm/addon-fit', () => ({
  FitAddon: class {
    fit(): void {}
  }
}))

beforeAll(() => {
  // use-terminal 的运行面:window(挂 resize 监听)与 requestAnimationFrame(首帧 fit)
  vi.stubGlobal('window', { addEventListener: () => undefined })
  vi.stubGlobal('requestAnimationFrame', (cb: (time: number) => void) => {
    cb(0)
    return 0
  })
})

afterAll(() => {
  vi.unstubAllGlobals()
})

describe('use-terminal 数据泵(Fix-2 守卫)', () => {
  it('先到先存、注册即放:未注册 id 的 pty:data 不丢,flush 进写入序列首部,之后正常直灌', () => {
    // 先开再关一个引导终端:确保数据泵已挂(dataBusBound 幂等),拿到泵回调
    openTerminal('s-boot', 10000, {} as HTMLElement)
    closeTerminal('s-boot')
    const pump = onPtyDataHandlers[0]
    expect(pump, '数据泵应随首次 openTerminal 挂上').toBeDefined()

    // spawn 与注册之间的丢失窗口:数据先到,id 尚未注册
    pump!({ sessionId: 's-early', data: 'BANNER-1' })
    pump!({ sessionId: 's-early', data: 'BANNER-2' })

    openTerminal('s-early', 10000, {} as HTMLElement)
    const terminal = createdTerminals.at(-1)!
    // flush 内容完整出现在写入序列首部
    expect(terminal.writes.join('')).toBe('BANNER-1BANNER-2')

    // 注册后的数据恢复直灌,顺序接在 flush 之后
    pump!({ sessionId: 's-early', data: 'LIVE' })
    expect(terminal.writes.join('')).toBe('BANNER-1BANNER-2LIVE')

    closeTerminal('s-early')
  })

  it('tab 关闭清理 pending:关闭前暂存的未注册数据不得串到此后新开的终端', () => {
    const pump = onPtyDataHandlers[0]!
    pump({ sessionId: 's-stale', data: 'STALE-OUT' })
    closeTerminal('s-stale') // 未注册过的 id 也走清理路径

    openTerminal('s-stale', 10000, {} as HTMLElement)
    const terminal = createdTerminals.at(-1)!
    expect(terminal.writes.join('')).toBe('')
    closeTerminal('s-stale')
  })
})
