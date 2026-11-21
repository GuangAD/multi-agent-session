// 会话导入编排(接缝 runImport / dedupeKey):按 agent 定义取扫描器 → 候选 → cwd 匹配项目 → 去重 → 入库
// 只改传入 store 的 sessions 段,不碰 fs:落盘由 ipc/sessions.ts 的防抖保存器编排(T4 同款分工)。
// 去重以 (agentId, externalSessionId) 为键(brief 7.1「重复导入不重复」);删除记录不登记任何忽略项——
// 2026-11-21 用户决策:删掉的会话再次导入时应当直接回来,故无忽略清单过滤。
import { randomUUID } from 'node:crypto'
import { agentRegistry } from '../../agents/agent-registry'
import { matchProjectDir } from './path-match'
import type { AgentId, AppStore, ProjectId, Session } from '../../../shared/types'

// 纯函数:键里带 agentId —— 不同 agent 的会话 id 空间互不相干,同一个 id 字符串可以是两条会话
export function dedupeKey(p: { agentId: AgentId; externalSessionId: string }): string {
  return `${p.agentId}\u0000${p.externalSessionId}`
}

function keyOf(agentId: AgentId, externalSessionId: string): string {
  return dedupeKey({ agentId, externalSessionId })
}

// 已有记录里带 externalSessionId 的(导入来的 + T8 回填过的)都算「已存在」:
// 回填过的自建会话与导入的同一对话是同一条,不该被再导一次。
function existingSessionKeys(store: AppStore): Set<string> {
  const keys = new Set<string>()
  for (const session of store.sessions) {
    if (session.externalSessionId) {
      keys.add(keyOf(session.agentId, session.externalSessionId))
    }
  }
  return keys
}

export async function runImport(
  store: AppStore,
  p: { projectId: ProjectId; agentId: AgentId; projectPath: string }
): Promise<{ imported: number; skipped: number }> {
  // 别名先归一(agentRegistry.getById 支持别名);没有扫描器 = 该 agent 暂不支持导入,按 0 处理
  const def = agentRegistry.getById(p.agentId)
  const scan = def?.sessions?.scan
  if (!def || !scan) {
    return { imported: 0, skipped: 0 }
  }
  const candidates = await scan(p.projectPath)
  const existingKeys = existingSessionKeys(store)
  const importedAt = new Date().toISOString()
  let imported = 0
  let skipped = 0

  for (const candidate of candidates) {
    // 只导「cwd 就是本项目目录」的会话;其余目录的候选不属于本次导入,既不入库也不计入 skipped
    if (!matchProjectDir(candidate.cwd, p.projectPath)) {
      continue
    }
    const key = keyOf(def.id, candidate.externalSessionId)
    if (existingKeys.has(key)) {
      skipped++
      continue
    }
    existingKeys.add(key) // 候选内部去重:同一次扫描里同一会话出现两次也只入一条
    store.sessions.push(
      toImportedSession(candidate, {
        projectId: p.projectId,
        agentId: def.id,
        importedAt,
        agentName: def.name
      })
    )
    imported++
  }

  return { imported, skipped }
}

function toImportedSession(
  candidate: {
    externalSessionId: string
    externalTitle?: string
    filePath?: string
    activityAt?: string
  },
  p: { projectId: ProjectId; agentId: AgentId; importedAt: string; agentName: string }
): Session {
  return {
    id: randomUUID(),
    projectId: p.projectId,
    agentId: p.agentId,
    // 显示名取 agent 侧原标题;没有标题(纯工具会话)时退回 agent 显示名,与 T4 新建会话同口径
    title: candidate.externalTitle ?? p.agentName,
    ...(candidate.externalTitle ? { externalTitle: candidate.externalTitle } : {}),
    createdAt: p.importedAt,
    origin: 'imported',
    externalSessionId: candidate.externalSessionId,
    ...(candidate.filePath ? { externalFilePath: candidate.filePath } : {}),
    ...(candidate.activityAt ? { activityAt: candidate.activityAt } : {})
  }
}
