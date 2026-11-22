// 台架守卫(T3.5 评审期修复「孤儿进程兜底」方案 A;真实 ConPTY + 真实进程树,非单元桩):
// kill/killAll 必须连带杀掉 shell 的子进程。背景:node-pty kill 派 conpty_console_list_agent
// AttachConsole 枚举控制台进程列表,附加失败即枚举不出子进程(dev 日志同款堆栈,本台架运行中
// 即复现);shell 底座(ADR-0004)后 agent CLI 是 cmd 的子进程,Windows 杀父不级联 → 孤儿烧 token。
// 红绿判据选「跨控制台子进程」:cmd 内 `start /MIN "" ping -n 30 127.0.0.1` 新开控制台,仍是 cmd
// 子进程,但 node-pty 全套机制(AttachConsole 枚举 + 控制台关闭连带收尸)都够不到它——本机实测
// 仅 pty.kill 后它必然存活(孤儿复现),唯一够到它的是按父链整树强杀(taskkill,见 pty-registry.ts
// killProcessTree)→ 变异(去兜底)必红、修复必绿。
// 对照说明:同控制台 ping(普通 `ping -n 30 127.0.0.1`)在本机会被控制台关闭连带收掉,对本变异
// 不敏感,不作为红绿判据;保留一条补充断言防常见路径回归(见第三个用例注释)。
// 识别方式:tasklist /FO CSV 按映像名 ping.exe + 基线差集认领本台架实例(约 30 秒长驻;不用
// node 子进程以免与测试自身混淆);kill 后轮询断言 PID 从 tasklist 消失,超时即失败。
// 不做平台跳过逻辑:本仓只 Windows 本机跑(首发平台约束),依赖真实 ConPTY 与 taskkill/tasklist。
import { execFile } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { afterAll, afterEach, describe, expect, it } from 'vitest'
import type { AgentDefinition } from '../shared/agents'
import type { AgentId, SessionId } from '../shared/types'
import { ptyRegistry } from './pty-registry'

const run = promisify(execFile)
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

// 识别目标:约 30 秒长驻;变异(去掉兜底)时残留期足够让轮询超时转红
const PING_LINE = 'ping -n 30 127.0.0.1'
// mutation 敏感形态:start 新开控制台,node-pty 的枚举与控制台关闭都够不到(实测孤儿必现)
const PING_LINE_CROSS_CONSOLE = 'start /MIN "" ping -n 30 127.0.0.1'

// 台架专用定义:command 用 ping(System32 必在 PATH,不依赖任何真实 agent CLI 安装);
// spawn 的注入行会先跑一次裸 ping(usage 报错即回提示符,无害),不影响台架
const benchDef: AgentDefinition = {
  id: 'kimi' as AgentId, // 台架夹具 id,仅落错误文案,不参与注册表
  name: '台架',
  command: 'ping',
  icon: '',
  color: 'bench-only', // 契约必填字段(T1);PTY 链路只读 command,值不参与判定
  state: {}
}

// tasklist /FO CSV /NH:行形如 "PING.EXE","1234",...;PID 与行结构为 ASCII,
// 其余列按 OEM 码页可能乱码,不影响解析;无匹配时输出 INFO 行、零 CSV 行
async function listPingPids(): Promise<Set<number>> {
  const { stdout } = await run('tasklist', ['/FO', 'CSV', '/NH', '/FI', 'IMAGENAME eq ping.exe'])
  const pids = new Set<number>()
  for (const line of stdout.split(/\r?\n/)) {
    const match = /^"ping\.exe","(\d+)"/i.exec(line.trim())
    if (match) {
      pids.add(Number(match[1]))
    }
  }
  return pids
}

// 轮询直至 probe 为真,超时抛错(消息带台架标签,红时可直接读出卡在哪一步)
async function until(label: string, probe: () => Promise<boolean>, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    if (await probe()) {
      return
    }
    if (Date.now() > deadline) {
      throw new Error(`台架等待超时(${timeoutMs}ms): ${label}`)
    }
    await sleep(250)
  }
}

// 本台架拉起并认领的 ping PID(基线差集);afterAll 兜杀,测试自身失败路径不留孤儿
const claimedPids = new Set<number>()
const dataOffs: Array<() => void> = []
const cwds: string[] = []

async function startSessionWithPing(id: SessionId, line: string): Promise<void> {
  const cwd = await mkdtemp(join(tmpdir(), 'pty-bench-'))
  cwds.push(cwd)
  await ptyRegistry.spawn({ sessionId: id, def: benchDef, cwd, cols: 120, rows: 40 })
  dataOffs.push(ptyRegistry.onData(() => undefined)) // 持续消耗字节流,防转发积压
  ptyRegistry.write(id, line + '\r')
}

// 等「子进程确实起来」:tasklist 出现 want 个基线外新 ping,认领其 PID 并登记兜杀
async function claimNewPingPids(baseline: Set<number>, want: number, label: string): Promise<number[]> {
  const claimed: number[] = []
  await until(`${label}:tasklist 出现 ${want} 个新 ping`, async () => {
    claimed.length = 0
    for (const pid of await listPingPids()) {
      if (!baseline.has(pid)) {
        claimed.push(pid)
      }
    }
    return claimed.length >= want
  }, 15_000)
  for (const pid of claimed) {
    claimedPids.add(pid)
  }
  return claimed
}

afterEach(async () => {
  ptyRegistry.killAll()
  for (const off of dataOffs) {
    off()
  }
  dataOffs.length = 0
  for (const dir of cwds.splice(0)) {
    await rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }).catch(
      () => undefined
    )
  }
})

// 兜底清场:任何失败路径下残留的 ping 一律强杀,台架自身不得留孤儿(镜像被测行为)
afterAll(async () => {
  ptyRegistry.killAll()
  const alive = await listPingPids()
  for (const pid of claimedPids) {
    if (alive.has(pid)) {
      await run('taskkill', ['/F', '/PID', String(pid)]).catch(() => undefined)
    }
  }
}, 30_000)

describe('kill 进程树兜底(真实 ConPTY 台架)', () => {
  it('kill(id):跨控制台 ping 子进程(start 新开控制台)被树杀兜底连带杀掉,tasklist 不再出现该 PID', async () => {
    const baseline = await listPingPids()
    await startSessionWithPing('s-kill-tree', PING_LINE_CROSS_CONSOLE)
    const [pingPid] = await claimNewPingPids(baseline, 1, 'kill 用例')
    expect(pingPid).toBeGreaterThan(0)

    ptyRegistry.kill('s-kill-tree')
    // 树杀生效则秒级消失;失败形态(孤儿)下 ping 存活至 30s 自然死亡,轮询先行超时转红。
    // 该形态对变异敏感:node-pty 自己(AttachConsole 枚举 + 控制台关闭)够不到它,去掉
    // killProcessTree 兜底后本用例必红(实测)。
    await until(`kill 后跨控制台 ping(pid=${pingPid})从 tasklist 消失`, async () => {
      return !(await listPingPids()).has(pingPid)
    }, 12_000)
    expect((await listPingPids()).has(pingPid)).toBe(false)
  }, 60_000)

  it('killAll:两个会话各带跨控制台 ping,killAll 后两个 ping 都不存在', async () => {
    const baseline = await listPingPids()
    await startSessionWithPing('s-kill-all-a', PING_LINE_CROSS_CONSOLE)
    await startSessionWithPing('s-kill-all-b', PING_LINE_CROSS_CONSOLE)
    const pids = await claimNewPingPids(baseline, 2, 'killAll 用例')
    expect(pids).toHaveLength(2)

    ptyRegistry.killAll()
    await until(`killAll 后跨控制台 ping(${pids.join('/')})从 tasklist 消失`, async () => {
      const now = await listPingPids()
      return pids.every((pid) => !now.has(pid))
    }, 12_000)
    const now = await listPingPids()
    expect(pids.every((pid) => !now.has(pid))).toBe(true)
  }, 60_000)

  it('kill(id):同控制台 ping 子进程 kill 后消失(补充断言,对本变异不敏感:同控制台子进程随控制台关闭已被连带收掉,防常见路径回归)', async () => {
    const baseline = await listPingPids()
    await startSessionWithPing('s-kill-same-console', PING_LINE)
    const [pingPid] = await claimNewPingPids(baseline, 1, '同控制台补充用例')
    expect(pingPid).toBeGreaterThan(0)

    ptyRegistry.kill('s-kill-same-console')
    await until(`kill 后同控制台 ping(pid=${pingPid})从 tasklist 消失`, async () => {
      return !(await listPingPids()).has(pingPid)
    }, 12_000)
    expect((await listPingPids()).has(pingPid)).toBe(false)
  }, 60_000)
})
