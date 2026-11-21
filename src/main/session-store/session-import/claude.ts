// claude 会话存储适配:定位 <home>/.claude/projects/<编码项目目录>/<会话 id>.jsonl,解析出导入候选
// (externalSessionId / externalTitle / cwd / activityAt)。目录编码见 claude-project-dir-encoding.ts(整文件搬)。
// 解析裁剪自 Orca src/main/ai-vault/scanners/claude/session-scanner-primary-parsers.ts (v1.4.265, MIT)
// 与同目录的文本归一:只留列表页需要的字段(id/cwd/标题/最后时间戳),消息正文、token 统计、
// 预览消息、子代理计数与注入上下文块过滤未搬。
import { promises as fs, type Dirent } from 'node:fs'
import { basename, extname, join } from 'node:path'
import { resolveAgentHome } from './agent-home'
import type { ImportCandidate } from '../../../shared/agents'
import {
  encodeClaudeProjectPaths,
  isClaudeProjectOwnBucketName
} from './claude-project-dir-encoding'

// 标题上限与 Orca normalizeTitleText 一致(96 字符),超出截断加省略号
const TITLE_TEXT_LIMIT = 96

type ClaudeTranscriptSummary = {
  sessionId: string | null
  cwd: string | null
  // 四级标题来源,custom-title 最权威,其次 Claude 生成的标题,再次真实用户输入,最后注入型元数据
  customTitle: string | null
  generatedTitle: string | null
  firstUserTitle: string | null
  metaTitle: string | null
  updatedAt: string | null
}

export async function scanClaude(
  projectPath: string,
  ctx: { homeDir?: string } = {}
): Promise<ImportCandidate[]> {
  const projectsRoot = join(resolveAgentHome(ctx.homeDir), '.claude', 'projects')
  const candidates: ImportCandidate[] = []
  for (const bucketPath of await listOwnBucketPaths(projectsRoot, projectPath)) {
    for (const filePath of await listTranscriptFiles(bucketPath)) {
      const candidate = await parseClaudeTranscript(filePath)
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

// 桶名匹配:Orca 的编码函数保大小写(桶名逐字符映射),而 Windows 上目录大小写不敏感、
// 同一项目可能被写成不同大小写 → 折叠只发生在比较侧,编码函数保持原样。
async function listOwnBucketPaths(projectsRoot: string, projectPath: string): Promise<string[]> {
  const entries = await readdirOrEmpty(projectsRoot)
  const encodedBucketNames = encodeClaudeProjectPaths(projectPath).map((name) => name.toLowerCase())
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) =>
      encodedBucketNames.some((encoded) =>
        isClaudeProjectOwnBucketName(name.toLowerCase(), encoded)
      )
    )
    .map((name) => join(projectsRoot, name))
}

// 只有桶目录顶层的 .jsonl 是会话 transcript;同目录的 sessions-index.json 等索引文件跳过,
// 子目录(<会话 id>/)只放子代理与工具输出(Orca isClaudeProjectBucketDirectory 同语义)。
async function listTranscriptFiles(bucketPath: string): Promise<string[]> {
  const entries = await readdirOrEmpty(bucketPath)
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.jsonl'))
    .map((entry) => join(bucketPath, entry.name))
}

async function readdirOrEmpty(dirPath: string): Promise<Dirent[]> {
  try {
    return await fs.readdir(dirPath, { withFileTypes: true })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [] // 未装该 agent / 从未建过会话:扫描结果为空,不是错误
    }
    throw error
  }
}

async function parseClaudeTranscript(filePath: string): Promise<ImportCandidate | null> {
  const summary = createSummary()
  let raw: string
  try {
    raw = await fs.readFile(filePath, 'utf8')
  } catch {
    return null // 扫描期间被删除/占用:跳过该文件,不中断整次导入
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
      continue // 崩溃时被截断的行:跳过该行(Orca 同样容忍 crash-torn rows)
    }
    consumeRecord(summary, record)
  }

  const cwd = summary.cwd
  if (!cwd) {
    return null // 没有 cwd 无从匹配项目(半截文件、非 transcript 的 jsonl)
  }
  const externalTitle =
    summary.customTitle ?? summary.generatedTitle ?? summary.firstUserTitle ?? summary.metaTitle
  return {
    // 文件名即会话 id;记录里的 sessionId 更权威(同 id 出现在多处时以内容为准)
    externalSessionId: summary.sessionId ?? basename(filePath, extname(filePath)),
    ...(externalTitle ? { externalTitle } : {}),
    filePath,
    cwd,
    activityAt: summary.updatedAt ?? (await fileMtimeIso(filePath))
  }
}

function createSummary(): ClaudeTranscriptSummary {
  return {
    sessionId: null,
    cwd: null,
    customTitle: null,
    generatedTitle: null,
    firstUserTitle: null,
    metaTitle: null,
    updatedAt: null
  }
}

function consumeRecord(summary: ClaudeTranscriptSummary, record: Record<string, unknown>): void {
  const sessionId = extractString(record.sessionId)
  if (sessionId) {
    summary.sessionId = sessionId
  }
  summary.cwd ??= extractString(record.cwd)
  updateTimeline(summary, record.timestamp)

  if (record.type === 'custom-title') {
    summary.customTitle = normalizeTitleText(extractString(record.customTitle) ?? '')
    return
  }
  if (record.type === 'ai-title') {
    summary.generatedTitle ??= normalizeTitleText(extractString(record.aiTitle) ?? '')
    return
  }
  if (record.type === 'agent-name') {
    summary.metaTitle ??= normalizeTitleText(extractString(record.agentName) ?? '')
    return
  }
  if (record.type !== 'user') {
    return // assistant 与其余记录类型对导入候选无贡献
  }
  const title = normalizeTitleText(extractMessageText(record.message) ?? '')
  if (!title) {
    return
  }
  // isMeta 的用户轮是 harness 注入(不是人打的提示),只能当兜底标题
  if (record.isMeta === true) {
    summary.metaTitle ??= title
  } else {
    summary.firstUserTitle ??= title
  }
}

// 时间线只保留「最后活动时间」:导入列表按它倒序(T6 契约「列表按 activityAt 倒序」)
function updateTimeline(summary: ClaudeTranscriptSummary, timestamp: unknown): void {
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

function extractMessageText(message: unknown): string | null {
  if (!message || typeof message !== 'object' || Array.isArray(message)) {
    return null
  }
  const content = (message as Record<string, unknown>).content
  if (typeof content === 'string') {
    return content
  }
  if (!Array.isArray(content)) {
    return null
  }
  const parts: string[] = []
  for (const item of content) {
    if (typeof item === 'string') {
      parts.push(item)
    } else if (item && typeof item === 'object' && !Array.isArray(item)) {
      const text = extractString((item as Record<string, unknown>).text)
      if (text) {
        parts.push(text)
      }
    }
  }
  return parts.length > 0 ? parts.join(' ') : null
}

function extractString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

// Orca normalizeTitleText 的裁剪:折叠空白 + 96 字符截断加省略号;注入上下文块过滤与代理对安全切分未搬
// (列表页标题只用于展示,长中文标题按 code unit 截断不会破坏 UTF-16 结构)。
function normalizeTitleText(value: string): string | null {
  const collapsed = value.replace(/\s+/g, ' ').trim()
  if (collapsed === '') {
    return null
  }
  return collapsed.length > TITLE_TEXT_LIMIT
    ? `${collapsed.slice(0, TITLE_TEXT_LIMIT - 3)}...`
    : collapsed
}
