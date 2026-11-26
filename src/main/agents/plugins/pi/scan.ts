// pi 会话存储适配:定位 <home>/.pi/agent/sessions/<编码桶>/<时间戳>_<uuid>.jsonl,解析出导入候选
// (externalSessionId / externalTitle / cwd / activityAt),另带该 .jsonl 的绝对路径——回填新鲜度判定要用它。
// 插件包形态(T1):本文件即 pi 插件的 sessions.scan。
// 解析裁剪自 Orca src/main/ai-vault/scanners/session-scanner-graph-parsers.ts 的
// consumeMessageGraphRecordLine(agent 'pi')(v1.4.265, MIT):只留 type=session 的 id/cwd、首条 role=user
// 消息文本与时间线;模型变更、token 统计、消息正文落盘、OMP 署名折叠未搬。
// Why 标题取首条真实用户消息:pi 的 transcript 里没有会话名字段(custom 只有 perm-mode),
// role=system 那条是 harness 系统提示(本机样本里 68KB),不是人打的字。
import { promises as fs, type Dirent } from 'node:fs'
import { basename, extname, join } from 'node:path'
// SDK 三件留守 session-import(扫描器自 session-import 迁入插件包,SDK 引用按新相对路径回指)
import { resolveAgentHome } from '../../../session-store/session-import/agent-home'
import type { ImportCandidate } from '../../../../shared/agents'

// 标题上限与 Orca normalizeTitleText 一致(96 字符),超出截断加省略号
const TITLE_TEXT_LIMIT = 96
const TRANSCRIPT_SUFFIX = '.jsonl'

type PiTranscriptSummary = {
  sessionId: string | null
  cwd: string | null
  firstUserTitle: string | null
  updatedAt: string | null
}

export async function scanPi(
  projectPath: string,
  ctx: { homeDir?: string } = {}
): Promise<ImportCandidate[]> {
  const sessionsRoot = join(resolveAgentHome(ctx.homeDir), '.pi', 'agent', 'sessions')
  const candidates: ImportCandidate[] = []
  for (const bucketPath of await listOwnBucketPaths(sessionsRoot, projectPath)) {
    // 只扫桶目录顶层:桶内的会话子目录(<时间戳>_<uuid>/<agentId>/run-0/session.jsonl)是子代理跑批,
    // 不是独立会话(本机 9 桶:顶层 34 个 .jsonl,递归则 164 个,多出来的全是子代理转录)
    for (const filePath of await listTranscriptFiles(bucketPath)) {
      const candidate = await parsePiTranscript(filePath)
      if (candidate) {
        candidates.push(candidate)
      }
    }
  }
  // 最近活动优先(侧栏按 activityAt 倒序展示,plan M4)
  return candidates.sort((left, right) =>
    (right.activityAt ?? '').localeCompare(left.activityAt ?? '')
  )
}

// 桶名 = '--' + 项目路径里每个 ':' '\\' 换成 '-' + '--',例:D:\工作区\alpha-app → --D--工作区-alpha-app--
// Why 敢按名字直接定位而不去读每个会话首行的 cwd:本机 9 个桶、34 个顶层 .jsonl 逐个核对过,桶名与
// 「首行 type=session 的 cwd 编码结果」全部一致;按名字定位只需读目标桶的十来个文件,而全量读首行
// 164 个文件要 ~1s(本机实测)。
function piBucketName(projectPath: string): string {
  // 尾分隔符不参与编码(matchProjectDir 也按去掉尾分隔符的口径比较路径)
  const trimmed = projectPath.replace(/[\\/]+$/, '')
  return `--${trimmed.replace(/[:\\]/g, '-')}--`
}

// 大小写折叠只发生在比较侧:Windows 目录大小写不敏感,同一个项目可能被 pi 记成不同大小写的桶名;
// 与 claude 侧(encodeClaudeProjectPaths + 折叠比较)同一口径。
async function listOwnBucketPaths(sessionsRoot: string, projectPath: string): Promise<string[]> {
  const wanted = piBucketName(projectPath).toLowerCase()
  return (await readdirOrEmpty(sessionsRoot))
    .filter((entry) => entry.isDirectory() && entry.name.toLowerCase() === wanted)
    .map((entry) => join(sessionsRoot, entry.name))
}

async function listTranscriptFiles(bucketPath: string): Promise<string[]> {
  const entries = await readdirOrEmpty(bucketPath)
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(TRANSCRIPT_SUFFIX))
    .map((entry) => join(bucketPath, entry.name))
}

async function readdirOrEmpty(dirPath: string): Promise<Dirent[]> {
  try {
    return await fs.readdir(dirPath, { withFileTypes: true })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [] // 未装 pi / 从未建过会话:扫描结果为空,不是错误
    }
    throw error
  }
}

async function parsePiTranscript(filePath: string): Promise<ImportCandidate | null> {
  let raw: string
  try {
    raw = await fs.readFile(filePath, 'utf8')
  } catch {
    return null // 扫描期间被删除/占用:跳过该文件,不中断整次导入
  }
  const summary = createSummary()
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

  const cwd = summary.cwd
  if (!cwd) {
    return null // 没有 cwd 无从匹配项目(半截文件、非会话的 jsonl)
  }
  return {
    // 首行 type=session 的 id 最权威;缺失时退回文件名里的 uuid(<时间戳>_<uuid>.jsonl)
    externalSessionId: summary.sessionId ?? sessionIdFromFileName(filePath),
    ...(summary.firstUserTitle ? { externalTitle: summary.firstUserTitle } : {}),
    filePath,
    cwd,
    activityAt: summary.updatedAt ?? (await fileMtimeIso(filePath))
  }
}

function createSummary(): PiTranscriptSummary {
  return { sessionId: null, cwd: null, firstUserTitle: null, updatedAt: null }
}

function consumeRecord(summary: PiTranscriptSummary, record: Record<string, unknown>): void {
  updateTimeline(summary, record.timestamp)
  if (record.type === 'session') {
    summary.sessionId ??= extractString(record.id)
    summary.cwd ??= extractString(record.cwd)
    return
  }
  if (record.type !== 'message' || summary.firstUserTitle !== null) {
    return // 首条用户消息一旦拿到,其余消息对导入候选无贡献
  }
  const message = asRecord(record.message)
  if (extractString(message?.role) !== 'user') {
    return // role=system 是 harness 注入的系统提示,role=assistant/toolResult 也不是人打的字
  }
  summary.firstUserTitle = normalizeTitleText(messageText(message?.content) ?? '')
}

// 时间线只保留「最后活动时间」:导入列表按它倒序(T6 契约「列表按 activityAt 倒序」)
function updateTimeline(summary: PiTranscriptSummary, timestamp: unknown): void {
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

// 文件名形态 <ISO时间戳>_<uuid>.jsonl:取最后一个 '_' 之后的部分
function sessionIdFromFileName(filePath: string): string {
  const stem = basename(filePath, extname(filePath))
  const separatorIndex = stem.lastIndexOf('_')
  return separatorIndex === -1 ? stem : stem.slice(separatorIndex + 1)
}

// message.content 可能是纯字符串,也可能是分片数组;只取 type=text 的片段(thinking 分片不算标题)
function messageText(content: unknown): string | null {
  if (typeof content === 'string') {
    return content
  }
  if (!Array.isArray(content)) {
    return null
  }
  const parts: string[] = []
  for (const item of content) {
    const part = asRecord(item)
    if (extractString(part?.type) === 'text') {
      const text = extractString(part?.text)
      if (text) {
        parts.push(text)
      }
    }
  }
  return parts.length > 0 ? parts.join(' ') : null
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
