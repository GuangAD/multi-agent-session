// 右栏面板显示哪个目录(T1):活动会话的运行目录优先,否则回落选中的项目。
// Why 需要独立的回落:面板是常驻的,而「活动会话」可能不存在(没开标签页)或其所属项目
// 已被移除(记录还在、项目没了),这两种情况都必须回落到侧栏选中的项目而不是空面板。
import { resolveSessionDir } from '../../shared/session-dir'
import type { Project, Session } from '../../shared/types'

export interface PanelRootInput {
  activeSession: Session | null
  // 活动会话所属项目;项目被移除后可能为 null(此时不能再用会话目录)
  activeProject: Project | null
  selectedProject: Project | null
}

export function resolvePanelRoot(input: PanelRootInput): string | null {
  // 会话与项目都在场才用会话目录:项目缺失时没有「所属项目路径」可回落,
  // 用错项目算出来的目录会指向别人的文件树
  if (input.activeSession && input.activeProject) {
    return resolveSessionDir(input.activeSession, input.activeProject)
  }
  return input.selectedProject?.path ?? null
}
