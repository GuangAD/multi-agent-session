// UI 交互切片:跨组件的界面状态——agent 选择弹窗与 worktree 弹窗的描述、设置对话框开合。
// 开弹窗的入口(快捷键、侧栏项目行「更多」菜单)与弹窗本体(AgentPickerDialog / WorktreeDialog /
// SettingsDialog)不在同一组件树分支,故经 store 共享(T11 既有模式)。目标项目显式记在描述里,
// 不依赖侧栏选中态。
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

// T4:worktree 弹窗描述。只带目标项目——分支/名称/agent 都是弹窗内部状态,
// 项目列表才是路径的权威源(描述不复制项目路径,避免与项目列表不一致)
export interface WorktreeDialogDescription {
  projectId: ProjectId
}

export interface UiSlice {
  // agent 选择弹窗描述(null = 未打开)
  agentDialog: AgentDialogDescription | null
  // 打开/覆盖弹窗描述:整体覆盖写入,无副作用与重入(幂等覆盖)
  openAgentDialog: (dialog: AgentDialogDescription) => void
  // 关闭弹窗:置 null;未打开时调用保持 null,不抛错(幂等)
  closeAgentDialog: () => void
  // 设置对话框开合(T6):入口在项目行「更多」菜单,对话框本体挂 App 根部,故经 store 共享
  settingsDialogOpen: boolean
  // 打开/关闭设置对话框:幂等写入布尔,无副作用
  openSettingsDialog: () => void
  closeSettingsDialog: () => void
  // T4:建 worktree 弹窗描述(null = 未打开)。入口在项目行「更多」菜单,弹窗本体挂 App 根部
  worktreeDialog: WorktreeDialogDescription | null
  // 打开/覆盖描述:整体覆盖写入,重复打开同一项目幂等,不叠加
  openWorktreeDialog: (dialog: WorktreeDialogDescription) => void
  // 关闭弹窗:置 null;未打开时调用保持 null,不抛错(幂等)
  closeWorktreeDialog: () => void
}

export const createUiSlice: StateCreator<AppState, [], [], UiSlice> = (set) => ({
  agentDialog: null,
  openAgentDialog: (dialog) => {
    set({ agentDialog: dialog })
  },
  closeAgentDialog: () => {
    set({ agentDialog: null })
  },
  settingsDialogOpen: false,
  openSettingsDialog: () => {
    set({ settingsDialogOpen: true })
  },
  closeSettingsDialog: () => {
    set({ settingsDialogOpen: false })
  },
  worktreeDialog: null,
  openWorktreeDialog: (dialog) => {
    set({ worktreeDialog: dialog })
  },
  closeWorktreeDialog: () => {
    set({ worktreeDialog: null })
  }
})
