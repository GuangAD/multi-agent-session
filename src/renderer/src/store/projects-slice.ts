// 项目目录切片:经 bridge 调 projects IPC,主进程负责去重与落盘
// 选中态(T3):新建会话链路需要目标项目,点击项目行选中(NewSessionMenu 据此创建)
import type { StateCreator } from 'zustand'
import type { Project, ProjectId, SessionId } from '../../../shared/types'
import { bridge } from '../ipc/bridge'
import type { AppState } from './app-store'

export interface ProjectsSlice {
  projects: Project[]
  selectedProjectId: ProjectId | null
  selectProject: (id: ProjectId) => void
  loadProjects: () => Promise<void>
  addProject: () => Promise<void> // 弹系统目录选择框;用户取消则不产生任何变化
  removeProject: (id: ProjectId) => Promise<void>
}

export const createProjectsSlice: StateCreator<AppState, [], [], ProjectsSlice> = (set, get) => ({
  projects: [],
  selectedProjectId: null,

  selectProject: (id) => {
    set({ selectedProjectId: id })
  },

  loadProjects: async () => {
    set({ projects: await bridge.projects.list() })
  },

  addProject: async () => {
    const project = await bridge.projects.add()
    if (!project) {
      return // 用户取消目录选择
    }
    set((state) => ({
      // 主进程对重复路径幂等返回已有项目,此处按 id 合并避免列表出现重复项
      projects: [...state.projects.filter((p) => p.id !== project.id), project]
    }))
  },

  removeProject: async (id) => {
    let closedTabs: SessionId[] // try 内必然赋值,catch 直接 return,无需初始值
    try {
      closedTabs = (await bridge.projects.remove(id)).closedTabs
    } catch (error) {
      console.error('删除项目失败:', error)
      return
    }
    // 连带关闭该项目下的标签页(杀 shell 编排在 closeTab 内,与 sessions:remove 同款)
    for (const tabId of closedTabs) {
      await get().closeTab(tabId)
    }
    set((state) => ({
      projects: state.projects.filter((p) => p.id !== id),
      // 移除的是选中项时清空选中,避免 NewSessionMenu 指向已删除项目
      selectedProjectId: state.selectedProjectId === id ? null : state.selectedProjectId
    }))
  }
})
