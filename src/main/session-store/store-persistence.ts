// store.json 原子读写与损坏兜底(spec 覆盖标准:接缝 storePersistence)
// 只认传入的路径参数,模块内不硬编码路径(controller 约定 3;路径由主进程 userData 决定)
import { promises as fs } from 'node:fs'
import { randomUUID } from 'node:crypto'
import type { AppStore, Settings } from '../../shared/types'
import { APP_THEMES, DEFAULT_APP_THEME_ID } from '../../shared/themes/app-themes'
import { TERMINAL_THEMES } from '../../shared/themes/catalog'
import { DEFAULT_TERMINAL_THEME_NAME } from '../../shared/themes/resolve'

// 非接缝,只读常量:store 默认值。settings 默认出自 spec 数据结构节——主题单槽(J-005:
// appTheme / terminalTheme,默认 github-dark 与 Ghostty Default Style Dark)加终端外观六项;
// terminalFontFamily 可选缺省 = 默认回退链,故不列默认值。
// loadStore 的「缺字段补默认」以本对象为唯一依据,旧字段迁移的兜底值也从这里取
export const DEFAULT_STORE: AppStore = {
  version: 1,
  projects: [],
  sessions: [],
  settings: {
    scrollbackRows: 10000,
    appTheme: DEFAULT_APP_THEME_ID,
    terminalTheme: DEFAULT_TERMINAL_THEME_NAME,
    shell: 'powershell',
    terminalFontSize: 14,
    terminalFontWeight: 300,
    terminalLineHeight: 1.0,
    terminalCursorStyle: 'block',
    terminalCursorBlink: false
  }
}

// Why: DEFAULT_STORE 是只读常量,兜底路径返回深拷贝,避免调用方(入口持有的内存 store)污染模块级默认值
function freshDefaultStore(): AppStore {
  return structuredClone(DEFAULT_STORE)
}

// 损坏兜底:原文件改名 <file>.corrupt-<ts> 留存,返回默认 store;不向调用方抛出
async function quarantineCorruptStore(file: string): Promise<AppStore> {
  try {
    await fs.rename(file, `${file}.corrupt-${Date.now()}`)
  } catch {
    // 改名失败(Windows 文件占用等)不阻塞兜底——store 内容已不可用,留存失败仅损失现场
  }
  return freshDefaultStore()
}

// 读文件 → JSON.parse → 缺字段补默认 → 解析失败走损坏兜底;任何解析失败都不抛出
// —— 主题单槽迁移(T-R1,ADR-0009):第一版的三态 + 深浅双槽字段 → appTheme / terminalTheme ——
// 旧键必须真删:整文件写回会把残留旧字段永久带着走,迁移逻辑以后改也清不掉。
const LEGACY_SETTINGS_KEYS = [
  'theme',
  'appThemeDark',
  'appThemeLight',
  'terminalThemeDark',
  'terminalThemeLight'
] as const

// 按顺序取第一个「非空且通过校验」的旧字段值(旧双槽字段共用)。
// Why 必须逐个校验而不是「先取第一个非空再判一次」(评审 I1):旧深槽值可能是带错字的坏 id
// (第一版 applyPatch 对槽字段只验非空字符串),此时应继续试浅槽,而不是直接落默认。
function firstMatching(
  source: Record<string, unknown>,
  keys: readonly string[],
  accept: (value: string) => boolean
): string | undefined {
  for (const key of keys) {
    const value = source[key]
    if (typeof value === 'string' && value !== '' && accept(value)) {
      return value
    }
  }
  return undefined
}

// appTheme:新字段优先(内容合法性交给渲染层 getAppTheme 兜底);旧槽值依次试,取第一个仍在新目录内的
function pickAppTheme(source: Record<string, unknown>): string {
  const current = source.appTheme
  if (typeof current === 'string' && current !== '') {
    return current
  }
  return (
    firstMatching(source, ['appThemeDark', 'appThemeLight'], (value) =>
      APP_THEMES.some((theme) => theme.id === value)
    ) ?? DEFAULT_STORE.settings.appTheme
  )
}

// terminalTheme 同款:旧终端主题名仅当仍在 22 套目录内才沿用(否则并入默认深色主题)
function pickTerminalTheme(source: Record<string, unknown>): string {
  const current = source.terminalTheme
  if (typeof current === 'string' && current !== '') {
    return current
  }
  return (
    firstMatching(
      source,
      ['terminalThemeDark', 'terminalThemeLight'],
      // 用 hasOwnProperty 而不是 `TERMINAL_THEMES[value] !== undefined`:后者会让手改 store.json 写进
      // 'constructor'/'toString' 这类原型键也通过校验(复审 P2-5)
      (value) => Object.prototype.hasOwnProperty.call(TERMINAL_THEMES, value)
    ) ?? DEFAULT_STORE.settings.terminalTheme
  )
}

// settings 归一化:补默认 → 迁移两主题字段 → 删旧键。返回全新对象,不改入参
function normalizeSettings(raw: unknown): Settings {
  const source = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>
  const settings = {
    ...DEFAULT_STORE.settings,
    ...(source as Partial<Settings>)
  } as Settings & Record<string, unknown>
  settings.appTheme = pickAppTheme(source)
  settings.terminalTheme = pickTerminalTheme(source)
  for (const key of LEGACY_SETTINGS_KEYS) {
    delete settings[key]
  }
  return settings
}

export async function loadStore(file: string): Promise<AppStore> {
  let raw: string
  try {
    raw = await fs.readFile(file, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return freshDefaultStore() // 首次启动尚无 store 文件
    }
    throw error // 读取基础设施故障(权限/磁盘)不是损坏,如实上抛
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return await quarantineCorruptStore(file)
  }
  if (typeof parsed !== 'object' || parsed === null) {
    return await quarantineCorruptStore(file) // 合法 JSON 但不是对象(如 null、数字)按损坏处理
  }

  const partial = parsed as Partial<AppStore>
  return {
    version: DEFAULT_STORE.version,
    projects: Array.isArray(partial.projects) ? partial.projects : [],
    sessions: Array.isArray(partial.sessions) ? partial.sessions : [],
    settings: normalizeSettings(partial.settings)
    // 旧版 store.json 若残留 ignoreList 字段,这里不读它:下次整文件写入时自然丢弃(2026-11-21 决策)
  }
}

// 同文件保存队列:并发保存按调用次序串行执行
// Why: Windows 上并发 rename 覆盖同一目标会瞬时 EPERM(目标正被另一 rename 替换)——
//      排队后 rename 永不重叠,竞态结构性消除而非靠重试时序;串行化落在接缝内,
//      IPC 层加锁保护不了 T4 起的其他调用方
const saveQueues = new Map<string, Promise<unknown>>()

// 序列化 → 写本次调用专属的 <file>.<uuid>.tmp → rename 覆盖;每次调用整体覆盖,无累积
// Why: 临时名带 per-call UUID——并发保存互不共享同一 tmp,固定 <file>.tmp 下的交错写/截断/
//      rename 消费竞态(ENOENT 或交错字节被发布)从根上消除
export function saveStoreAtomic(file: string, store: AppStore): Promise<void> {
  const last = saveQueues.get(file) ?? Promise.resolve()
  const task = last.then(() => writeStoreAtomically(file, store))
  // 链上存吞掉失败的尾随 promise:前一次保存失败不阻塞也不毒化后续,调用方仍从返回值拿到原始错误
  saveQueues.set(
    file,
    task.catch(() => undefined)
  )
  return task
}

async function writeStoreAtomically(file: string, store: AppStore): Promise<void> {
  const tmpFile = `${file}.${randomUUID()}.tmp`
  const payload = JSON.stringify(store, null, 2)
  try {
    await fs.writeFile(tmpFile, payload, 'utf8')
    await fs.rename(tmpFile, file)
  } catch (error) {
    await fs.unlink(tmpFile).catch(() => {}) // best-effort 清理失败残留,清理失败不抛出
    throw error
  }
}
