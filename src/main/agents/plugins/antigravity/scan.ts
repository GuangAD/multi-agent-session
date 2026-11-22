// antigravity 会话存储适配:brain 目录里的 transcript 只给消息,不给 cwd——cwd 从三个旁证关联出来
// (history 行的 conversationId > 首条 prompt 的 hash + 时间邻近 > cache 里唯一的 WorkspaceURIs)。
// 插件包形态(T1):本文件即 antigravity 插件的 sessions.scan。
// Ported from stablyai/orca src/main/ai-vault/scanners/antigravity/session-scanner-antigravity-paths.ts,
// session-scanner-antigravity-parser.ts, session-scanner-antigravity-history.ts,
// session-scanner-antigravity-metadata.ts、antigravity-history-prompt.ts 与
// antigravity-transcript-candidates.ts(两种落盘形态按 mtime 择新、同刻用 full) (v1.4.265, MIT):
// 保留记录过滤(USER_EXPLICIT/USER + USER_INPUT/REQUEST)、<USER_REQUEST> 剥壳、prompt 归一后取 sha256、
// 时间邻近 ±2s 且唯一命中才认账、WorkspaceURIs 只认唯一一条 file: URI;
// cache 的 ProjectID/projects.json/last_conversations.json 三条旁证、消息正文落盘、token 统计,以及 ACP 会话的
// cwd 源(antigravityAcpSessionMetadataPath 的 conversations/<id>.meta,agy acp 不写 history.jsonl)未搬。
// 本机未装 antigravity:目录布局与记录形状取自上述 Orca 源码与测试样本工厂,尚未经本机实测核对。
import { createHash } from 'node:crypto'
import { promises as fs, type Dirent } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
// SDK 三件留守 session-import(扫描器自 session-import 迁入插件包,SDK 引用按新相对路径回指)
import { resolveAgentHome } from '../../../session-store/session-import/agent-home'
import type { ImportCandidate } from '../../../../shared/agents'

// 标题上限与 Orca normalizeTitleText 一致(96 字符),超出截断加省略号
const TITLE_TEXT_LIMIT = 96
const SYSTEM_GENERATED_DIR = '.system_generated'
const LOGS_DIR = 'logs'
// 同一会话有两种落盘形态。**mtime 优先**:Orca prioritizeAntigravityTranscriptCandidates 按 mtime 降序选,
// 时间相同才用 transcript_full 作 tiebreak——transcript.jsonl 可能比 transcript_full.jsonl 新(压缩后的旧 full 常年不动)
const TRANSCRIPT_FILE = 'transcript.jsonl'
const TRANSCRIPT_FULL_FILE = 'transcript_full.jsonl'
// history 行的时间与开场 prompt 的时间只允许差这么多(Orca HISTORY_MATCH_WINDOW_MS)
const HISTORY_MATCH_WINDOW_MS = 2_000

type AntigravityTranscriptSummary = {
  openingPromptHash: string | null
  openingPromptAtMs: number | null
  title: string | null
  updatedAtMs: number | null
  userPromptCount: number
}

type AntigravityHistoryIndex = {
  workspaceByConversationId: Map<string, string | null>
  workspaceByPromptHash: Map<string, { atMs: number; workspace: string }[]>
}

// projectPath 不参与定位(与 codex/kimi 同一分工):brain 目录不分项目,匹配项目交给 runImport 的 matchProjectDir。
export async function scanAntigravity(
  _projectPath: string,
  ctx: { homeDir?: string } = {}
): Promise<ImportCandidate[]> {
  const agentHome = join(resolveAgentHome(ctx.homeDir), '.gemini', 'antigravity-cli')
  const brainDir = join(agentHome, 'brain')
  const conversationIds = await listConversationIds(brainDir)
  if (conversationIds.length === 0) {
    return []
  }
  // history.jsonl 与 cache/ 都在 brain 的上一级(Orca antigravityHistoryPathForBrainDir / antigravityCachePath)
  const historyIndex = await readHistoryIndex(join(dirname(brainDir), 'history.jsonl'))
  const workspaceUriByConversationId = await readWorkspaceUris(
    join(agentHome, 'cache', 'conversation_metadata.json')
  )

  const candidates: ImportCandidate[] = []
  for (const conversationId of conversationIds) {
    const filePath = await findTranscriptPath(brainDir, conversationId)
    if (!filePath) {
      continue
    }
    const summary = await parseTranscript(filePath)
    if (summary.userPromptCount === 0) {
      continue // 没有一条用户输入就不是可导入的会话(也拿不到标题)
    }
    // history 对该 id 有记录就以它为准:值可能是 null(同一 id 指向两个目录 = 记录不可信),
    // 那时必须拒绝而不是往后 fallback(Orca findAntigravityWorkspace 的 has() → get() ?? null 同口径)。
    const cwd = historyIndex.workspaceByConversationId.has(conversationId)
      ? (historyIndex.workspaceByConversationId.get(conversationId) ?? null)
      : (workspaceByOpeningPrompt(historyIndex, summary) ??
        workspaceUriByConversationId.get(conversationId) ??
        null)
    if (!cwd) {
      continue // cwd 关联不出来:无从匹配项目,原样留着也无从续接
    }
    candidates.push({
      externalSessionId: conversationId,
      ...(summary.title ? { externalTitle: summary.title } : {}),
      filePath,
      cwd,
      ...(summary.updatedAtMs === null
        ? {}
        : { activityAt: new Date(summary.updatedAtMs).toISOString() })
    })
  }
  // 最近活动优先(侧栏按 activityAt 倒序展示,plan M4)
  return candidates.sort((left, right) =>
    (right.activityAt ?? '').localeCompare(left.activityAt ?? '')
  )
}

async function listConversationIds(brainDir: string): Promise<string[]> {
  return (await readdirOrEmpty(brainDir)).filter((entry) => entry.isDirectory()).map((e) => e.name)
}

async function readdirOrEmpty(dirPath: string): Promise<Dirent[]> {
  try {
    return await fs.readdir(dirPath, { withFileTypes: true })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [] // 未装 antigravity / 从未建过会话:扫描结果为空,不是错误
    }
    throw error
  }
}

// brain/<会话 id>/.system_generated/logs/{transcript,transcript_full}.jsonl
async function findTranscriptPath(
  brainDir: string,
  conversationId: string
): Promise<string | null> {
  const logsDir = join(brainDir, conversationId, SYSTEM_GENERATED_DIR, LOGS_DIR)
  let best: { filePath: string; mtimeMs: number; isFull: boolean } | null = null
  for (const [fileName, isFull] of [
    [TRANSCRIPT_FULL_FILE, true],
    [TRANSCRIPT_FILE, false]
  ] as const) {
    const filePath = join(logsDir, fileName)
    try {
      const stats = await fs.stat(filePath)
      if (!stats.isFile()) {
        continue
      }
      // 只认更新的那份:mtime 相同(同一批落盘)才用 full 兜底,保证两侧都在时选得更完整的一份
      const candidate = { filePath, mtimeMs: stats.mtimeMs, isFull }
      if (
        best === null ||
        candidate.mtimeMs > best.mtimeMs ||
        (candidate.mtimeMs === best.mtimeMs && candidate.isFull && !best.isFull)
      ) {
        best = candidate
      }
    } catch {
      // 这一形态不存在(未生成 full、会话被清理):继续看另一种
    }
  }
  return best?.filePath ?? null
}

async function parseTranscript(filePath: string): Promise<AntigravityTranscriptSummary> {
  const summary: AntigravityTranscriptSummary = {
    openingPromptHash: null,
    openingPromptAtMs: null,
    title: null,
    updatedAtMs: null,
    userPromptCount: 0
  }
  let raw: string
  try {
    raw = await fs.readFile(filePath, 'utf8')
  } catch {
    return summary // 扫描期间被删除/占用:当空转录处理
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
      continue // 崩溃时被截断的行:跳过该行
    }
    consumeRecord(summary, record)
  }
  return summary
}

function consumeRecord(
  summary: AntigravityTranscriptSummary,
  record: Record<string, unknown>
): void {
  const recordAtMs = timestampMs(record.created_at)
  if (recordAtMs !== null && (summary.updatedAtMs === null || recordAtMs > summary.updatedAtMs)) {
    summary.updatedAtMs = recordAtMs
  }
  const source = extractString(record.source)
  const type = extractString(record.type)
  const isUserRequest =
    (source === 'USER_EXPLICIT' || source === 'USER') &&
    (type === 'USER_INPUT' || type === 'REQUEST')
  if (!isUserRequest) {
    return // MODEL/PLANNER_RESPONSE 等记录对导入候选无贡献(消息正文落盘未搬)
  }
  const request = extractUserRequest(extractString(record.content) ?? '')
  if (!request) {
    return
  }
  summary.userPromptCount++
  if (summary.openingPromptHash === null && summary.title === null) {
    // 只有开场那条参与 cwd 关联:标题、createdAt、滚动预览都认不出原始提示(Orca 同口径)
    summary.openingPromptHash = promptHash(request)
    summary.openingPromptAtMs = recordAtMs
    summary.title = normalizeTitleText(request)
  }
}

// 用户输入可能被 <USER_REQUEST> 包裹(客户端元数据与真正的问题混在一条 content 里)
function extractUserRequest(content: string): string | null {
  const opener = '<USER_REQUEST>'
  const startIndex = content.indexOf(opener)
  if (startIndex === -1) {
    return extractString(content)
  }
  const bodyStart = startIndex + opener.length
  const endIndex = content.indexOf('</USER_REQUEST>', bodyStart)
  return extractString(
    endIndex === -1 ? content.slice(bodyStart) : content.slice(bodyStart, endIndex)
  )
}

// 截断过的标题不再唯一,不能拿来当关联钥匙(Orca antigravityHistoryPromptHash 同口径)
function promptHash(prompt: string): string | null {
  if (prompt.length > 4096) {
    return null
  }
  const normalized = normalizeTitleText(prompt)
  return normalized && !normalized.endsWith('...')
    ? createHash('sha256').update(normalized).digest('hex')
    : null
}

async function readHistoryIndex(historyPath: string): Promise<AntigravityHistoryIndex> {
  const index: AntigravityHistoryIndex = {
    workspaceByConversationId: new Map(),
    workspaceByPromptHash: new Map()
  }
  let raw: string
  try {
    raw = await fs.readFile(historyPath, 'utf8')
  } catch {
    return index // 没有 history:关联退化到 WorkspaceURIs
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
      continue // 半截行跳过,别让一行坏数据关掉整条关联链
    }
    const workspace = extractString(record.workspace)
    const atMs = timestampMs(record.timestamp)
    if (!workspace || workspace.length > 4096 || atMs === null) {
      continue
    }
    const conversationId = extractString(record.conversationId)
    if (conversationId) {
      setUnique(index.workspaceByConversationId, conversationId, workspace)
    }
    const hash = promptHash(extractString(record.display) ?? '')
    if (hash) {
      const rows = index.workspaceByPromptHash.get(hash) ?? []
      rows.push({ atMs, workspace })
      index.workspaceByPromptHash.set(hash, rows)
    }
  }
  return index
}

// 同一个 id 在 history 里指向两个目录 = 记录不可信,置 null 而不是随便挑一个
function setUnique(map: Map<string, string | null>, key: string, value: string): void {
  if (!map.has(key)) {
    map.set(key, value)
    return
  }
  if (map.get(key) !== value) {
    map.set(key, null)
  }
}

// 时间邻近 + hash 唯一命中才算数:同一条提示可能在不同项目里各跑过一次
function workspaceByOpeningPrompt(
  index: AntigravityHistoryIndex,
  summary: AntigravityTranscriptSummary
): string | null {
  const openingAtMs = summary.openingPromptAtMs
  if (!summary.openingPromptHash || openingAtMs === null) {
    return null
  }
  const matches = (index.workspaceByPromptHash.get(summary.openingPromptHash) ?? []).filter(
    (entry) => Math.abs(entry.atMs - openingAtMs) <= HISTORY_MATCH_WINDOW_MS
  )
  return matches.length === 1 ? (matches[0]?.workspace ?? null) : null
}

// cache/conversation_metadata.json 的 conversations[id].summary.WorkspaceURIs:
// 只在恰好一条 file: URI 时认账(多根工作区的会话说不清是哪个目录)
async function readWorkspaceUris(metadataPath: string): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  let conversations: Record<string, unknown> | null
  try {
    conversations = asRecord(
      asRecord(JSON.parse(await fs.readFile(metadataPath, 'utf8')))?.conversations
    )
  } catch {
    return map // 没有 cache(CLI 版根本不写):关联退化到 history
  }
  if (!conversations) {
    return map
  }
  for (const [conversationId, value] of Object.entries(conversations)) {
    // 同一个 JSON 对象的键不会重复,这里不存在「同 id 两个目录」的歧义
    const uri = soleWorkspaceUriPath(asRecord(asRecord(value)?.summary)?.WorkspaceURIs)
    if (uri) {
      map.set(conversationId, uri)
    }
  }
  return map
}

function soleWorkspaceUriPath(uris: unknown): string | null {
  if (!Array.isArray(uris) || uris.length !== 1 || typeof uris[0] !== 'string') {
    return null
  }
  try {
    const url = new URL(uris[0])
    if (url.protocol !== 'file:') {
      return null
    }
    // URI 带的是录制时的 path 风格,VS Code 系序列化会把盘符冒号编码成 %3A
    const windows = url.host !== '' || /^\/[A-Za-z](?::|%3[Aa])(?:\/|$)/.test(url.pathname)
    return fileURLToPath(url, { windows })
  } catch {
    return null
  }
}

// 旧行存 ISO 串,新行存秒(小于 1e12 按秒补),两种都要能读(Orca timestampMs)
function timestampMs(value: unknown): number | null {
  if (typeof value === 'string') {
    const parsed = Date.parse(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return null
  }
  return value > 1_000_000_000_000 ? value : value * 1000
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
