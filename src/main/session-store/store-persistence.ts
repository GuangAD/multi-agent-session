// store.json 原子读写与损坏兜底(spec 覆盖标准:接缝 storePersistence)
// 只认传入的路径参数,模块内不硬编码路径(controller 约定 3;路径由主进程 userData 决定)
import { promises as fs } from 'node:fs'
import { randomUUID } from 'node:crypto'
import type { AppStore } from '../../shared/types'

// 非接缝,只读常量:store 默认值(settings 默认出自 plan:scrollback 10000、theme 跟随系统)
export const DEFAULT_STORE: AppStore = {
  version: 1,
  projects: [],
  sessions: [],
  settings: { scrollbackRows: 10000, theme: 'system' }
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
    settings: {
      ...DEFAULT_STORE.settings,
      ...(typeof partial.settings === 'object' && partial.settings !== null ? partial.settings : {})
    }
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
