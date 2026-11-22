// Ported from stablyai/orca src/main/ai-vault/scanners/claude/claude-project-dir-encoding.ts (v1.4.265, MIT)
// 复制 + 裁剪:保留 encodeClaudeProjectPaths / encodeClaudeProjectPath / isClaudeProjectOwnBucketName
// (含常量 CLAUDE_BUCKET_NAME_MAX_LENGTH);裁剪 claudeProjectBucketScopePrefixes /
// isClaudeProjectBucketInScope / claudeProjectBucketNameBelowScope / mayBeHashedClaudeProjectBucketName /
// isClaudeProjectBucketDirectory。
// 裁剪理由:这些 helper 判定「某个桶目录是否落在某 scope 之下」,本任务的扫描只看单个项目自己的桶
// (见本目录 claude.ts),用不到。
// 唯一改写:分隔符归一收到 session-import SDK 的 runtime-path-separators;源文件的 `// Why:` 风格原注保留。
// 作用:算出 Claude Code 在 ~/.claude/projects/ 下为某个项目目录建的桶名。
import { normalizeRuntimePathSeparators } from '../../../session-store/session-import/runtime-path-separators'

/** Encode case-preserving raw paths and NFC variants; comparison keys lose Windows case and macOS can supply NFD. */
export function encodeClaudeProjectPaths(pathValue: string): string[] {
  const raw = encodeClaudeProjectPath(pathValue)
  const composed = encodeClaudeProjectPath(pathValue.normalize('NFC'))
  return raw === composed ? [raw] : [raw, composed]
}

/** Preserve case and one dash per non-alphanumeric character; Claude bucket names do not collapse runs. */
export function encodeClaudeProjectPath(pathValue: string): string {
  const separated = normalizeRuntimePathSeparators(pathValue)
  const trimmed =
    separated === '/' || /^[A-Za-z]:\/$/.test(separated) ? separated : separated.replace(/\/+$/, '')
  return trimmed.replace(/[^a-zA-Z0-9]/g, '-')
}

// Claude Code names a longer encoded path's bucket `<first 200 characters>-<hash>`; older versions kept the full name.
const CLAUDE_BUCKET_NAME_MAX_LENGTH = 200

/** Whether a bucket is an encoded path's own, under its full name or Claude Code's `<first 200>-<hash>` cut. */
export function isClaudeProjectOwnBucketName(projectDirName: string, encodedPath: string): boolean {
  return (
    projectDirName === encodedPath ||
    (encodedPath.length > CLAUDE_BUCKET_NAME_MAX_LENGTH &&
      projectDirName.startsWith(`${encodedPath.slice(0, CLAUDE_BUCKET_NAME_MAX_LENGTH)}-`))
  )
}
