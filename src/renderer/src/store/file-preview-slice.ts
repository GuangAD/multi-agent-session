// 文件预览切片(T9 评审期用户调整):预览从右栏移到中间区域,做成标签栏里的预览标签页。
// previewPath = 当前预览的文件(单实例,点另一个文件替换内容);previewName = 标签页显示名
// (路径末段自派——渲染层禁 Node 模块,node:path 不可用,白屏教训见开发记录);
// previewActive = 预览标签页是否处于激活态(点终端标签切回终端,预览标签保留可再点开)。
// Why 进 Zustand:预览的发起方在右栏(FileTree)、渲染地在中间区(TerminalTabs),跨组件状态,
// 组件局部 state 不再适用(原裁决 7 的前提因布局调整失效,如实登记)。
import type { StateCreator } from 'zustand'
import type { AppState } from './app-store'

export interface FilePreviewSlice {
  previewPath: string | null
  previewName: string
  previewActive: boolean
  // 打开/切换预览:置路径并激活(重复点击同一文件幂等);显示名 = 路径末段(渲染层无 node:path)
  openPreview: (path: string) => void
  activatePreview: () => void
  deactivatePreview: () => void
  closePreview: () => void
}

export const createFilePreviewSlice: StateCreator<AppState, [], [], FilePreviewSlice> = (set) => ({
  previewPath: null,
  previewName: '',
  previewActive: false,

  openPreview: (path) => {
    set({
      previewPath: path,
      previewName: path.split(/[\\/]+/).pop() ?? path,
      previewActive: true
    })
  },

  activatePreview: () => {
    set({ previewActive: true })
  },

  deactivatePreview: () => {
    set({ previewActive: false })
  },

  closePreview: () => {
    set({ previewPath: null, previewName: '', previewActive: false })
  }
})
