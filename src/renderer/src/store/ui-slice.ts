// UI 交互切片:跨组件的界面状态。目前只有「agent 选择弹窗」的描述——
// 开弹窗的入口(本任务:App 快捷键 Ctrl+N;T2 接入侧栏项目行入口)与弹窗本体(AgentPickerDialog)不在同一组件树
// 分支,故经 store 共享(T11 既有模式)。目标项目显式记在描述里,不依赖侧栏选中态。
import type { StateCreator } from 'zustand'
import type { ProjectId } from '../../../shared/types'
import type { AppState } from './app-store'

// 弹窗模式:'new' 新建会话(点选 agent 走 openSession)| 'import' 导入历史会话(走 importSessions)
export type AgentDialogMode = 'new' | 'import'

// 弹窗描述:模式 + 目标项目;null = 弹窗关闭。整体覆盖式读写,不做字段合并(不保留旧字段)。
export interface AgentDialogDescription {
  mode: AgentDialogMode
  projectId: ProjectId
}

export interface UiSlice {
  // agent 选择弹窗描述(null = 未打开)
  agentDialog: AgentDialogDescription | null
  // 打开/覆盖弹窗描述:整体覆盖写入,无副作用与重入(幂等覆盖)
  openAgentDialog: (dialog: AgentDialogDescription) => void
  // 关闭弹窗:置 null;未打开时调用保持 null,不抛错(幂等)
  closeAgentDialog: () => void
}

export const createUiSlice: StateCreator<AppState, [], [], UiSlice> = (set) => ({
  agentDialog: null,
  openAgentDialog: (dialog) => {
    set({ agentDialog: dialog })
  },
  closeAgentDialog: () => {
    set({ agentDialog: null })
  }
})
