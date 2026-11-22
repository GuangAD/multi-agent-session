// 接线守卫:插件清单 ↔ agentRegistry ↔ runImport 三方接线(评审 Minor-A 起源,T1 插件化改写)
// Why:run-import.test.ts 只验证 runImport 消费注入的候选(它不再 mock 注册表,也不需要注册表),
// 于是没有任何用例证明「真实注册表里的插件挂了扫描器/续接器」。定义删掉一行 `scan:` 或 `resumeArgv:`,
// 导入会静默返回 {imported:0}、重开静默原样拉起,而既有用例全绿——本文件补这个盲区。
// 因此这里绝不 mock 注册表,也不 mock 扫描器:import 真实插件清单装载注册表(T1 起注册表不自带清单,
// 唯一登记点是 agents/plugins),遍历 agentRegistry.list() 而非硬编码五 id(清单增删用例自动跟随)。
// 真实扫描行为由各插件包 <id>.test.ts 回放 fixture 覆盖,本文件只管接线。
// T1 增补反向依赖守卫:runImport 依赖反转后,session-import 生产文件不得 import agents 域
// (agents/agent-registry、agents/plugins)——brief 失败形态「双向例外消灭」,回潮即红。
// T8 增补接线守卫保留:① 定义挂 resumeArgv;② 编排层 scanNewOnly 套用 filterFreshCandidates
// (评审 Important-1:纯函数行为由 backfill.test.ts 直接断言,但 ipc/pty.ts 带 electron 依赖
// 无法进单测,调用点被绕开时纯函数用例仍全绿,这里按同一「接线守卫」定位对编排源码做静态断言)。
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { agentRegistry } from '../../agents/agent-registry'
// 装载真实插件清单(生产由入口 src/main/index.ts 同样只 import 它一次)
import '../../agents/plugins'

const SESSION_IMPORT_DIR = fileURLToPath(new URL('.', import.meta.url))

// T1 反向依赖守卫的判定:import 语句指到的模块说明符里出现 agents 路径段(且不是 shared/agents——
// shared 是进程间契约,不属于 agents 域)
const IMPORT_SPECIFIER_PATTERN =
  /\bfrom\s+['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]|\bimport\s+['"]([^'"]+)['"]/g

function specifiersOf(source: string): string[] {
  const found: string[] = []
  for (const match of source.matchAll(IMPORT_SPECIFIER_PATTERN)) {
    found.push(match[1] ?? match[2] ?? match[3] ?? '')
  }
  return found
}

function importsAgentsDomain(specifier: string): boolean {
  const segments = specifier.split('/')
  return segments.some(
    (segment, index) => segment === 'agents' && segments[index - 1] !== 'shared'
  )
}

describe('导入扫描器接线', () => {
  // 接线是同一件事(插件清单里 sessions.scan 已注册);遍历真实注册表,漏接哪个插件由报错文案点出来。
  it('注册表全部插件都挂了 sessions.scan(不 mock 注册表,遍历 list())', () => {
    const defs = agentRegistry.list()
    expect(defs.length, '注册表为空:插件清单 agents/plugins 未装载').toBeGreaterThan(0)
    for (const def of defs) {
      expect(
        typeof def.sessions?.scan,
        `agents:list 中 ${def.id} 的 sessions.scan 不是函数:插件未挂扫描器,导入会静默返回 {imported:0}`
      ).toBe('function')
    }
  })

  // 续接接线守卫(对称于上面的 scan 守卫):插件删掉一行 resumeArgv,重开链路会
  // 静默原样拉起(对话不续接),既有用例全绿——这里问一句「续接参数构造器在不在」。
  it('注册表全部插件都挂了 sessions.resumeArgv(不 mock 注册表,遍历 list())', () => {
    for (const def of agentRegistry.list()) {
      expect(
        typeof def.sessions?.resumeArgv,
        `agents:list 中 ${def.id} 的 sessions.resumeArgv 不是函数:插件未挂续接参数,重开会原样拉起不续接`
      ).toBe('function')
    }
  })

  // T1 反向依赖守卫(静态断言):session-import 目录的生产文件(非 .test.ts)不得 import agents 域。
  // 依赖反转后 runImport 只认注入的 scan;编排若重新 import agentRegistry,「导入不依赖注册表」的
  // 依赖方向即被破坏(双向例外回潮),本用例直接红。
  it('session-import 生产文件不 import agents 域(反向依赖守卫)', () => {
    const offenders: string[] = []
    for (const entry of readdirSync(SESSION_IMPORT_DIR)) {
      if (!entry.endsWith('.ts') || entry.endsWith('.test.ts')) {
        continue
      }
      const source = readFileSync(join(SESSION_IMPORT_DIR, entry), 'utf8')
      const hit = specifiersOf(source).find(importsAgentsDomain)
      if (hit !== undefined) {
        offenders.push(`${entry} → ${hit}`)
      }
    }
    expect(
      offenders,
      `session-import 生产文件出现 agents 域 import:${offenders.join('; ')}——依赖反转被破坏,组合必须留在 IPC 层`
    ).toEqual([])
  })

  // Fix-1(评审 Important-1)接线守卫:回填编排的 scanNewOnly 必须真的套用候选新鲜度护栏。
  // 纯函数语义由 backfill.test.ts 直接断言,但 ipc/pty.ts 带 electron 依赖无法进单测——
  // 若编排调用点把 filterFreshCandidates 绕开(回到仅 known 集合过滤),从未导入的历史文件
  // 会被首扫误写回,而纯函数用例仍全绿。这里对编排源码做静态断言(读文本,不 import)。
  it('编排层 scanNewOnly 套用了 filterFreshCandidates(读 ipc/pty.ts 源码静态断言;T8 Fix-1 接线守卫)', () => {
    const source = readFileSync(new URL('../../ipc/pty.ts', import.meta.url), 'utf8')
    expect(
      source.includes('filterFreshCandidates('),
      'ipc/pty.ts 未调用 filterFreshCandidates:候选新鲜度护栏被绕开,从未导入的历史文件会被首扫误写回、重开续接到别的对话(评审 Important-1)'
    ).toBe(true)
  })
})
