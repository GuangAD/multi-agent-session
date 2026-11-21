// kimi 会话存储适配:双源拼一个候选——state.json 给 id/标题/时间线,session_index.jsonl 给 cwd。
// 目录布局:~/.kimi-code/sessions/<工作区目录>/session_<id>/state.json,索引在 ~/.kimi-code/session_index.jsonl
// (索引路径按布局推导,不信 state.json 里内嵌的路径)。
// 裁剪自 Orca src/main/ai-vault/scanners/kimi/session-scanner-kimi-paths.ts 与
// session-scanner-kimi-parser.ts (v1.4.265, MIT):保留「会话 id = 目录名且带 session_ 前缀」「cwd 只从索引取」
// 「state 时间戳兼容 ISO 串与 epoch 毫秒」三条;wire.jsonl 转录解析(消息正文、token 累计、模型)未搬。
// 本机未装 kimi:目录布局与 state.json 键取自上述 Orca 源码,尚未经本机实测核对。
import { promises as fs, type Dirent } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { resolveAgentHome } from './agent-home'
import type { ImportCandidate } from '../../../shared/agents'

// 标题上限与 Orca normalizeTitleText 一致(96 字符),超出截断加省略号
const TITLE_TEXT_LIMIT = 96
const SESSION_DIRECTORY_PREFIX = 'session_'
const STATE_FILE_NAME = 'state.json'
// 布局深度上限:工作区目录 → 会话目录 → state.json。宽度不设限,深度封顶以免误入深目录树
const MAX_LAYOUT_DEPTH = 3

type KimiStateSummary = {
  title: string | null
  lastPrompt: string | null
  updatedAt: string | null
}

// projectPath 不参与定位:kimi 的存储按工作区分目录、cwd 只记在索引里,
// 匹配项目交给 runImport 的 matchProjectDir(scan 的入参形状由 AgentDefinition 统一,与 codex 同一分工)。
export async function scanKimi(
  _projectPath: string,
  ctx: { homeDir?: string } = {}
): Promise<ImportCandidate[]> {
  const agentHome = join(resolveAgentHome(ctx.homeDir), '.kimi-code')
  const sessionsDir = join(agentHome, 'sessions')
  // Why 索引路径从布局推导:Orca 明确「Derive the index from the discovered layout rather than trusting
  // paths embedded in state.json」——state.json 里的路径可能属于别的机器/别的 home。
  const workDirBySessionId = await readWorkDirBySessionId(
    join(dirname(sessionsDir), 'session_index.jsonl')
  )

  const candidates: ImportCandidate[] = []
  for (const statePath of await findStateFiles(sessionsDir, 0)) {
    const candidate = await parseKimiSession(statePath, workDirBySessionId)
    if (candidate) {
      candidates.push(candidate)
    }
  }
  // 最近活动优先(侧栏按 activityAt 倒序展示,plan M4)
  return candidates.sort((left, right) =>
    (right.activityAt ?? '').localeCompare(left.activityAt ?? '')
  )
}

// 会话状态文件的识别条件与 Orca 的 filePredicate 同形:文件名 state.json 且父目录名以 session_ 开头。
// 不锁死「工作区目录在上一级」这种细节——那一级目录名随 kimi 版本变,而 cwd 只认索引。
async function findStateFiles(dirPath: string, depth: number): Promise<string[]> {
  const found: string[] = []
  for (const entry of await readdirOrEmpty(dirPath)) {
    const entryPath = join(dirPath, entry.name)
    if (entry.isDirectory()) {
      if (depth < MAX_LAYOUT_DEPTH) {
        found.push(...(await findStateFiles(entryPath, depth + 1)))
      }
      continue
    }
    if (
      entry.isFile() &&
      entry.name === STATE_FILE_NAME &&
      basename(dirPath).startsWith(SESSION_DIRECTORY_PREFIX)
    ) {
      found.push(entryPath)
    }
  }
  return found
}

async function readdirOrEmpty(dirPath: string): Promise<Dirent[]> {
  try {
    return await fs.readdir(dirPath, { withFileTypes: true })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [] // 未装 kimi / 从未建过会话:扫描结果为空,不是错误
    }
    throw error
  }
}

// 索引行 {sessionId, workDir}:后写的行胜出(会话换工作区后续跑时索引会追加新行)
async function readWorkDirBySessionId(indexPath: string): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  let raw: string
  try {
    raw = await fs.readFile(indexPath, 'utf8')
  } catch {
    return map // 没有索引 = 所有会话都缺 cwd,不该让整次导入失败
  }
  for (const line of raw.split(/\r?\n/)) {
    if (line.trim() === '') {
      continue
    }
    let record: Record<string, unknown>
    try {
      const parsed: unknown = JSON.parse(line)
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        continue
      }
      record = parsed as Record<string, unknown>
    } catch {
      continue // 崩溃时被截断的行:跳过该行,不丢其余会话的 cwd
    }
    const sessionId = extractString(record.sessionId)
    const workDir = extractString(record.workDir)
    if (sessionId && workDir) {
      map.set(sessionId, workDir)
    }
  }
  return map
}

async function parseKimiSession(
  statePath: string,
  workDirBySessionId: Map<string, string>
): Promise<ImportCandidate | null> {
  // 会话 id 就是目录名,且 session_ 前缀属于 id 本身:kimi --session 期望拿到完整目录名
  const externalSessionId = basename(dirname(statePath))
  const workDir = workDirBySessionId.get(externalSessionId)
  if (!workDir) {
    return null // 索引里没有这个会话 → 解析不出 cwd,无从匹配项目(Orca 同样留 cwd=null)
  }
  let stateRecord: Record<string, unknown>
  try {
    const parsed: unknown = JSON.parse(await fs.readFile(statePath, 'utf8'))
    const record = asRecord(parsed)
    if (!record) {
      return null
    }
    stateRecord = record
  } catch {
    return null // 半截/损坏的 state.json:跳过这一条,不让一次导入整体失败
  }

  const summary = createSummary(stateRecord)
  const title = summary.title ?? summary.lastPrompt
  return {
    externalSessionId,
    ...(title ? { externalTitle: title } : {}),
    // 转录路径保留 state.json 本身(Orca 的会话 file 就是它;wire.jsonl 的续接参数属 T8)
    filePath: statePath,
    cwd: workDir,
    ...(summary.updatedAt ? { activityAt: summary.updatedAt } : {})
  }
}

function createSummary(stateRecord: Record<string, unknown>): KimiStateSummary {
  return {
    title: normalizeTitleText(extractString(stateRecord.title) ?? ''),
    lastPrompt: normalizeTitleText(extractString(stateRecord.lastPrompt) ?? ''),
    updatedAt: laterTimestamp(stateRecord.createdAt, stateRecord.updatedAt)
  }
}

// 旧版 kimi state 存 ISO 串,v2 存 epoch 毫秒;两个字段取更晚的那个
function laterTimestamp(createdAt: unknown, updatedAt: unknown): string | null {
  const created = timestampIso(createdAt)
  const updated = timestampIso(updatedAt)
  if (!created || !updated) {
    return created ?? updated
  }
  return updated > created ? updated : created
}

function timestampIso(value: unknown): string | null {
  if (typeof value === 'string') {
    const parsed = Date.parse(value)
    return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null
  }
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return null
  }
  // Orca timestampMs 的口径:大于 1e12 视为毫秒,否则按秒补
  const parsed = value > 1_000_000_000_000 ? value : value * 1000
  return new Date(parsed).toISOString()
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function extractString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

// 与 claude 适配同一条规则(Orca normalizeTitleText 的裁剪):折叠空白 + 96 字符截断加省略号
function normalizeTitleText(value: string): string | null {
  const collapsed = value.replace(/\s+/g, ' ').trim()
  if (collapsed === '') {
    return null
  }
  return collapsed.length > TITLE_TEXT_LIMIT
    ? `${collapsed.slice(0, TITLE_TEXT_LIMIT - 3)}...`
    : collapsed
}
