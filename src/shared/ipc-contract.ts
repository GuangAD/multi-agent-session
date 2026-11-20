// IPC 契约:通道名与载荷类型一一对应(spec 模块划分「契约先行」)
// T1 只落 projects 三通道;其余通道由后续任务增量补(T2 增补 agents:list)。
import type { Project, ProjectId } from './types'
import type { AgentListItem } from './agents'

// 通道名常量:main/ipc/channels.ts 转发使用,preload 直接引用,保证单一拼写
export const IPC_CHANNELS = {
  projectsList: 'projects:list',
  projectsAdd: 'projects:add',
  projectsRemove: 'projects:remove',
  agentsList: 'agents:list'
} as const

// preload 暴露给渲染层的桥接 API 面;main 按此注册 handler
export interface ProjectsApi {
  list: () => Promise<Project[]>
  add: () => Promise<Project | null> // null:用户取消了目录选择
  remove: (id: ProjectId) => Promise<void>
}

export interface AgentsApi {
  // 安装检测在主进程完成:一次返回全部定义与安装状态(def 可整体结构化克隆)
  list: () => Promise<AgentListItem[]>
}

export interface AppApi {
  projects: ProjectsApi
  agents: AgentsApi
}
