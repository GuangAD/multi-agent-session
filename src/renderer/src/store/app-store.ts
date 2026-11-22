// Zustand 装配:按域切片(spec 模块划分:store/app-store.ts)
import { create } from 'zustand'
import { createProjectsSlice, type ProjectsSlice } from './projects-slice'
import { createFilePreviewSlice, type FilePreviewSlice } from './file-preview-slice'
import { createUiSlice, type UiSlice } from './ui-slice'
import { createSessionsSlice, type SessionsSlice } from './sessions-slice'
import { createRunStateSlice, type RunStateSlice } from './run-state-slice'
import { createAgentsSlice, type AgentsSlice } from './agents-slice'

export type AppState =
  ProjectsSlice & SessionsSlice & RunStateSlice & FilePreviewSlice & UiSlice & AgentsSlice

export const useAppStore = create<AppState>()((...args) => ({
  ...createProjectsSlice(...args),
  ...createSessionsSlice(...args),
  ...createRunStateSlice(...args),
  ...createFilePreviewSlice(...args),
  ...createUiSlice(...args),
  ...createAgentsSlice(...args)
}))
