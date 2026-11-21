// codex 会话存储适配:遍历 <home>/.codex/sessions/**/rollout-*.jsonl(.zst),解析出导入候选
// (externalSessionId / externalTitle / cwd / activityAt)。
// 解析裁剪自 Orca src/main/ai-vault/scanners/codex/session-scanner-codex-parser.ts (v1.4.265, MIT):
// 只留 session_meta(id/cwd/标题) + 首条用户消息当兜底标题 + 最后时间戳;token 统计、消息正文、
// 标题索引文件、非用户来源(worker 转录)过滤未搬。
// 去重裁剪自 Orca src/main/ai-vault/scanners/codex/codex-session-root-dedup.ts (v1.4.265, MIT):
// 同一 thread id 的多份(换根 bridging/backfill、双形态孪生)只留一条;inode 级证明未搬(见下方说明)。
// 文件名/双形态规则在 codex-rollout-files.ts(移植件)。
import { promises as fs, type BigIntStats, type Dirent } from 'node:fs'
import { join } from 'node:path'
import { zstdDecompressSync } from 'node:zlib'
import { resolveAgentHome } from './agent-home'
import type { ImportCandidate } from '../../../shared/agents'
import {
  COMPRESSED_ROLLOUT_SUFFIX,
  parseCodexRolloutThreadId,
  plainWins,
  rolloutTwinPath
} from './codex-rollout-files'

// Legacy names require content proof; canonical names encode immutable rollout identity.
const CODEX_ROLLOUT_FILE_NAME_PATTERN = /^rollout-.+\.jsonl(?:\.zst)?$/
// 标题上限与 claude 侧同口径(Orca normalizeTitleText:96 字符,超出截断加省略号)
const TITLE_TEXT_LIMIT = 96

type CodexRolloutSummary = {
  sessionId: string | null
  cwd: string | null
  // 元数据标题(payload.title/thread_name)优先,首条用户提示兜底(Orca titleSource 同级)
  metaTitle: string | null
  firstUserTitle: string | null
  updatedAt: string | null
}

// projectPath 当前不参与定位:codex 的存储按日期分目录、cwd 记在 session_meta 里,
// 匹配项目交给 runImport 的 matchProjectDir(scan 的入参形状由 AgentDefinition 统一)。
export async function scanCodex(
  _projectPath: string,
  ctx: { homeDir?: string } = {}
): Promise<ImportCandidate[]> {
  const sessionsRoot = join(resolveAgentHome(ctx.homeDir), '.codex', 'sessions')
  const rolloutPaths = await dropShadowedTwins(await listRolloutFiles(sessionsRoot))
  const candidates: ImportCandidate[] = []
  for (const filePath of rolloutPaths) {
    const candidate = await parseCodexRollout(filePath)
    if (candidate) {
      candidates.push(candidate)
    }
  }
  return dedupeRolloutCandidates(candidates)
}

async function listRolloutFiles(dirPath: string): Promise<string[]> {
  const files: string[] = []
  for (const entry of await readdirOrEmpty(dirPath)) {
    const entryPath = join(dirPath, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await listRolloutFiles(entryPath)))
    } else if (entry.isFile() && CODEX_ROLLOUT_FILE_NAME_PATTERN.test(entry.name)) {
      files.push(entryPath)
    }
  }
  return files
}

async function readdirOrEmpty(dirPath: string): Promise<Dirent[]> {
  try {
    return await fs.readdir(dirPath, { withFileTypes: true })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [] // 未装 codex / 从未建过会话:扫描结果为空,不是错误
    }
    throw error
  }
}

// .zst 双形态:Codex 把冷 rollout 压成 .jsonl.zst 并保留 mtime,恢复会话时重建 .jsonl 继续追加。
// 两种形态同时存在时按 Orca plainWins 只读一份(明文不新于非空 .zst → 明文没有 .zst 缺的内容)。
async function dropShadowedTwins(paths: string[]): Promise<string[]> {
  const keep = new Set(paths)
  for (const plainPath of paths) {
    if (plainPath.endsWith(COMPRESSED_ROLLOUT_SUFFIX)) {
      continue
    }
    const compressedPath = rolloutTwinPath(plainPath)
    if (!keep.has(compressedPath)) {
      continue
    }
    const [plainStats, compressedStats] = await Promise.all([
      statIfPresent(plainPath),
      statIfPresent(compressedPath)
    ])
    if (!plainStats?.isFile() || !compressedStats?.isFile()) {
      continue
    }
    if (plainWins(plainStats, compressedStats)) {
      keep.delete(compressedPath)
    } else {
      keep.delete(plainPath)
    }
  }
  return paths.filter((path) => keep.has(path))
}

async function statIfPresent(filePath: string): Promise<BigIntStats | undefined> {
  try {
    return await fs.stat(filePath, { bigint: true })
  } catch {
    return undefined
  }
}

async function parseCodexRollout(filePath: string): Promise<ImportCandidate | null> {
  let raw: string
  try {
    const bytes = await fs.readFile(filePath)
    raw = filePath.endsWith(COMPRESSED_ROLLOUT_SUFFIX)
      ? zstdDecompressSync(bytes).toString('utf8')
      : bytes.toString('utf8')
  } catch {
    return null // 解压失败/文件被占用:跳过这一条,不让一次导入整体失败
  }

  const summary = createSummary()
  let sawSessionMeta = false
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
    updateTimeline(summary, record.timestamp)
    const payload = asRecord(record.payload)
    // Fork 出来的 rollout 可能在后文复制父会话的 session_meta:第一条定身份
    if (record.type === 'session_meta' && payload && !sawSessionMeta) {
      sawSessionMeta = true
      summary.sessionId = extractString(payload.id) ?? summary.sessionId
      summary.cwd = extractString(payload.cwd) ?? summary.cwd
      summary.metaTitle = extractCodexMetaTitle(payload)
      continue
    }
    if (record.type === 'turn_context' && payload) {
      summary.cwd ??= extractString(payload.cwd)
      continue
    }
    if (summary.firstUserTitle === null) {
      summary.firstUserTitle = normalizeTitleText(codexUserMessageText(record, payload) ?? '')
    }
  }

  // 文件名带 thread id(rollout-<stamp>-<id>):session_meta 缺失时按文件名兜底
  const externalSessionId =
    summary.sessionId ?? parseCodexRolloutThreadId(filePath)?.threadId ?? null
  if (!externalSessionId || !summary.cwd) {
    return null // 没有 id 或 cwd 的文件不是可导入的会话
  }
  const externalTitle = summary.metaTitle ?? summary.firstUserTitle
  return {
    externalSessionId,
    ...(externalTitle ? { externalTitle } : {}),
    filePath,
    cwd: summary.cwd,
    activityAt: summary.updatedAt ?? (await fileMtimeIso(filePath))
  }
}

function createSummary(): CodexRolloutSummary {
  return { sessionId: null, cwd: null, metaTitle: null, firstUserTitle: null, updatedAt: null }
}

// Orca extractCodexSessionMetadataTitle:标题可能记在 title / thread_name / threadName 三个键上(版本差异)
function extractCodexMetaTitle(payload: Record<string, unknown>): string | null {
  return (
    normalizeTitleText(extractString(payload.title) ?? '') ??
    normalizeTitleText(extractString(payload.thread_name) ?? '') ??
    normalizeTitleText(extractString(payload.threadName) ?? '')
  )
}

// 首条用户消息:新格式走 event_msg/item_completed 的 UserMessage item(history_mode=paginated),
// 老格式走 event_msg/user_message 或 response_item 的 message 行
function codexUserMessageText(
  record: Record<string, unknown>,
  payload: Record<string, unknown> | null
): string | null {
  if (!payload) {
    return null
  }
  if (record.type === 'event_msg' && payload.type === 'item_completed') {
    const item = asRecord(payload.item)
    return item?.type === 'UserMessage' ? contentText(item.content) : null
  }
  if (record.type === 'event_msg' && payload.type === 'user_message') {
    return extractString(payload.message)
  }
  if (record.type === 'response_item' && payload.type === 'message' && payload.role === 'user') {
    return contentText(payload.content)
  }
  return null
}

function contentText(content: unknown): string | null {
  if (typeof content === 'string') {
    return content
  }
  if (!Array.isArray(content)) {
    return null
  }
  const parts: string[] = []
  for (const item of content) {
    const text = asRecord(item)?.text
    if (typeof text === 'string') {
      parts.push(text)
    }
  }
  return parts.length > 0 ? parts.join(' ') : null
}

// 时间线只保留「最后活动时间」:导入列表按它倒序(T6 契约「列表按 activityAt 倒序」)
function updateTimeline(summary: CodexRolloutSummary, timestamp: unknown): void {
  const value = extractString(timestamp)
  if (!value) {
    return
  }
  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed)) {
    return
  }
  const iso = new Date(parsed).toISOString()
  if (summary.updatedAt === null || iso > summary.updatedAt) {
    summary.updatedAt = iso
  }
}

async function fileMtimeIso(filePath: string): Promise<string | undefined> {
  try {
    const stats = await fs.stat(filePath)
    return stats.mtime.toISOString()
  } catch {
    return undefined
  }
}

// 同一 thread id 只留一条:明文形态优先(能继续追加的那份是最新事实源),其次活动时间更新的,
// 最后按路径字典序定胜者(扫描结果稳定,重复导入不会来回抖)。
// Why 不做 inode 级证明:本任务只扫一个存储根,同根内同名多份必然是同一会话的副本,
// 内容里的 session_meta.id 就是权威身份。
function dedupeRolloutCandidates(candidates: ImportCandidate[]): ImportCandidate[] {
  const bestById = new Map<string, ImportCandidate>()
  for (const candidate of candidates) {
    const current = bestById.get(candidate.externalSessionId)
    if (!current || outranks(candidate, current)) {
      bestById.set(candidate.externalSessionId, candidate)
    }
  }
  return [...bestById.values()].sort((left, right) =>
    (right.activityAt ?? '').localeCompare(left.activityAt ?? '')
  )
}

function outranks(candidate: ImportCandidate, current: ImportCandidate): boolean {
  const candidateIsPlain = !(candidate.filePath ?? '').endsWith(COMPRESSED_ROLLOUT_SUFFIX)
  const currentIsPlain = !(current.filePath ?? '').endsWith(COMPRESSED_ROLLOUT_SUFFIX)
  if (candidateIsPlain !== currentIsPlain) {
    return candidateIsPlain
  }
  const candidateTime = candidate.activityAt ?? ''
  const currentTime = current.activityAt ?? ''
  if (candidateTime !== currentTime) {
    return candidateTime > currentTime
  }
  return (candidate.filePath ?? '') < (current.filePath ?? '')
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
