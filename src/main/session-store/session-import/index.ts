// 会话导入编排(接缝 runImport / dedupeKey):扫描器经入参注入(scan 依赖反转,T1 插件化)→ 候选 →
// cwd 匹配项目 → 去重 → 入库。只改传入 store 的 sessions 段,不碰 fs:落盘由 ipc/sessions.ts 的防抖保存器编排
// (T4 同款分工)。去重以 (agentId, externalSessionId) 为键(brief 7.1「重复导入不重复」);删除记录不登记任何
// 忽略项——2026-11-21 用户决策:删掉的会话再次导入时应当直接回来,故无忽略清单过滤。
// 依赖方向(守卫钉住):本目录生产文件不 import agents 域——组合点在 IPC 层(ipc/sessions.ts 从注册表
// 取插件并把 sessions?.scan 注入);无 scan 时按 0 处理,语义不变。
import { randomUUID } from 'node:crypto'
import { matchProjectDir } from './path-match'
import type { ImportCandidate } from '../../../shared/agents'
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
// 孤儿记录(其 projectId 对应的项目已删除,永不可见)不参与去重:
// 否则删除项目重新添加后(id 变化)旧记录占着键,同会话永远无法导入回可见列表
// (2026-11-21 T8 冒烟期本机实况:4 条孤儿拦截,提示「跳过 6 条」而列表只有 2 条)。
function existingSessionKeys(store: AppStore): Set<string> {
  const liveProjects = new Set(store.projects.map((project) => project.id))
  const keys = new Set<string>()
  for (const session of store.sessions) {
    if (session.externalSessionId && liveProjects.has(session.projectId)) {
      keys.add(keyOf(session.agentId, session.externalSessionId))
    }
  }
  return keys
}

export async function runImport(
  store: AppStore,
  p: {
    projectId: ProjectId
    agentId: AgentId
    // 显示名(无标题候选的兜底标题,沿用旧口径);别名归一与取插件都在组合点完成
    agentName: string
    projectPath: string
    // T1 依赖反转:扫描函数由组合点注入;缺省 = 该 agent 不支持导入,按 0 处理
    scan?: (projectPath: string, ctx?: { homeDir?: string }) => Promise<ImportCandidate[]>
    homeDir?: string
  }
): Promise<{ imported: number; skipped: number }> {
  // 没有扫描器 = 按 0 处理,不抛错(既有口径);编排不查注册表——scan 由组合点注入
  const { scan } = p
  if (!scan) {
    return { imported: 0, skipped: 0 }
  }
  const candidates = await scan(p.projectPath, { homeDir: p.homeDir })
  const existingKeys = existingSessionKeys(store)
  const importedAt = new Date().toISOString()
  let imported = 0
  let skipped = 0

  for (const candidate of candidates) {
    // 只导「cwd 就是本项目目录」的会话;其余目录的候选不属于本次导入,既不入库也不计入 skipped
    if (!matchProjectDir(candidate.cwd, p.projectPath)) {
      continue
    }
    const key = keyOf(p.agentId, candidate.externalSessionId)
    if (existingKeys.has(key)) {
      skipped++
      continue
    }
    existingKeys.add(key) // 候选内部去重:同一次扫描里同一会话出现两次也只入一条
    store.sessions.push(
      toImportedSession(candidate, {
        projectId: p.projectId,
        agentId: p.agentId,
        importedAt,
        agentName: p.agentName
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
