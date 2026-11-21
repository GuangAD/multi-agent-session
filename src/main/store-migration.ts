// 旧产品名数据目录 → 现产品名的一次性迁移(T11;评审 Minor-9 抽成可测单元)
// 背景:产品名 2026-11-21 由 agent-sessions 定为 Soloport,Electron 的 userData 目录随之变成
// %APPDATA%/Soloport,而用户真实的项目/会话记录在旧目录 %APPDATA%/agent-sessions。
// 决策:只在「新目录没有 store.json 且旧目录有」时复制一份——
//   · 复制而非搬移:旧文件留在原处,迁移出问题可回退,也不怕中途失败留下半个文件;
//   · 新目录已有则不覆盖:用户已经在新名字下工作过,不能被旧数据盖掉;
//   · 旧目录没有则什么都不做:全新安装的正常路径。
// Why 不 import electron:靠入参传两个目录,才能用临时目录写单测(AGENTS.md:纯逻辑同目录单测)。
import { constants } from 'node:fs'
import { access, copyFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'

const STORE_FILE = 'store.json'

async function fileExists(target: string): Promise<boolean> {
  try {
    await access(target, constants.F_OK)
    return true
  } catch {
    return false
  }
}

export interface MigrateResult {
  migrated: boolean
  // 未迁移的原因,便于日志与单测断言
  reason?: 'new-exists' | 'legacy-missing' | 'copy-failed'
  error?: unknown
}

// 返回值而不是抛错:迁移失败不得阻塞应用启动(新目录按空 store 起,旧文件仍在原处可人工处理)
export async function migrateLegacyStore(
  newDir: string,
  legacyDir: string
): Promise<MigrateResult> {
  const newStore = join(newDir, STORE_FILE)
  const legacyStore = join(legacyDir, STORE_FILE)

  if (await fileExists(newStore)) {
    return { migrated: false, reason: 'new-exists' }
  }
  if (!(await fileExists(legacyStore))) {
    return { migrated: false, reason: 'legacy-missing' }
  }
  try {
    await mkdir(newDir, { recursive: true })
    await copyFile(legacyStore, newStore)
    return { migrated: true }
  } catch (error) {
    return { migrated: false, reason: 'copy-failed', error }
  }
}
