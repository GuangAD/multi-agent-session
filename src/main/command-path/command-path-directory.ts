// Ported from stablyai/orca src/main/ipc/command-path/command-path-directory.ts (MIT)
// Why: PATH 探测的目录清单读取——折叠名匹配(directoryNameKey)与大目录/不可读目录的降级语义(null = 逐个 stat 探测)是原文件行为,整文件移植;worker 版读取不移植,消费方在本仓为进程内调用。

import type { Dir } from 'node:fs'
import { opendir } from 'node:fs/promises'

const MAX_DETECTION_DIRECTORY_ENTRIES = 128

export function directoryNameKey(name: string): string {
  return name.normalize('NFD').toLowerCase()
}

export async function readDetectionDirectory(dir: string): Promise<Map<string, string> | null> {
  let directory: Dir
  try {
    directory = await opendir(dir, { bufferSize: MAX_DETECTION_DIRECTORY_ENTRIES + 1 })
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      (error.code === 'ENOENT' || error.code === 'ENOTDIR')
    ) {
      return new Map()
    }
    // Searchable-but-unreadable directories still admit stat on known names.
    return null
  }
  try {
    const names = new Map<string, string>()
    let entries = 0
    for await (const entry of directory) {
      if (++entries > MAX_DETECTION_DIRECTORY_ENTRIES) {
        // Large directories cost less to probe by candidate than to enumerate in full.
        return null
      }
      if (/[^\p{ASCII}]/u.test(entry.name)) {
        // Filesystem Unicode equivalence can exceed JavaScript normalization and case folding.
        return null
      }
      names.set(directoryNameKey(entry.name), entry.name)
    }
    return names
  } catch {
    // A vanished entry during Dirent conversion cannot prove the directory empty.
    return null
  }
}
