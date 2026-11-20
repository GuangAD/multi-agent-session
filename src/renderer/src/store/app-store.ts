// Zustand 装配:按域切片(spec 模块划分:store/app-store.ts)
import { create } from 'zustand'
import { createProjectsSlice, type ProjectsSlice } from './projects-slice'

export type AppState = ProjectsSlice

export const useAppStore = create<AppState>()((...args) => ({
  ...createProjectsSlice(...args)
}))
