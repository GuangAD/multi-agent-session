// Ported from stablyai/orca src/main/codex/history/rollouts/codex-rollout-thread-id.ts (v1.4.265, MIT)
// 与 stablyai/orca src/main/codex/history/rollouts/codex-rollout-compressed-twin.ts (v1.4.265, MIT)
// 裁剪:只搬本任务用例需要的「文件名 → thread id」与「.jsonl / .jsonl.zst 双形态优先级」;
// 归档搬运(rolloutTwinPath 之外的文件移动、listRolloutTwinPairs、holdsRolloutTwins、
// compressedRolloutsFirst 排序)与 store 侧判据 isRolloutTwinKeptFromStore 未搬。

import type { BigIntStats } from 'node:fs'

// A reverted thread's rollout adds `_<rollout id>` after the thread id.
const CODEX_ROLLOUT_THREAD_ID_PATTERN =
  /^rollout-(.+)-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:_[0-9a-f-]{36})?\.jsonl(?:\.zst)?$/i

export function parseCodexRolloutThreadId(
  filePath: string
): { threadId: string; rolloutStamp: string } | null {
  const match = CODEX_ROLLOUT_THREAD_ID_PATTERN.exec(lastPathSegment(filePath))
  return match ? { threadId: match[2].toLowerCase(), rolloutStamp: match[1] } : null
}

function lastPathSegment(filePath: string): string {
  return filePath.split(/[\\/]/).at(-1) ?? ''
}

export const COMPRESSED_ROLLOUT_SUFFIX = '.zst'

/** The rollout's other form: `X.jsonl` for `X.jsonl.zst` and the reverse. */
export function rolloutTwinPath(path: string): string {
  return path.endsWith(COMPRESSED_ROLLOUT_SUFFIX)
    ? path.slice(0, -COMPRESSED_ROLLOUT_SUFFIX.length)
    : `${path}${COMPRESSED_ROLLOUT_SUFFIX}`
}

// Codex compresses a cold rollout keeping its mtime and appends to the `.jsonl` when both exist,
// so a `.jsonl` no newer than a non-empty `.zst` holds nothing the `.zst` lacks.
export function plainWins(plain: BigIntStats, compressed: BigIntStats): boolean {
  return compressed.size === 0n || plain.mtimeNs > compressed.mtimeNs
}
