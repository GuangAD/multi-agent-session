// 文件预览切片(T9 评审期用户调整):预览从右栏移到中间区域,做成标签栏里的预览标签页。
// previewPath = 当前预览的文件(单实例,点另一个文件替换内容);previewName = 标签页显示名
// (路径末段自派——渲染层禁 Node 模块,node:path 不可用,白屏教训见开发记录);
// previewActive = 预览标签页是否处于激活态(点终端标签切回终端,预览标签保留可再点开);
// previewKind = 预览内容形态(T10 增补):'file' 普通只读预览 / 'git-diff' 变更文件差异,
// 中间区按它分流渲染组件(两者的 root 都不进标签载荷,组件自己从 store 取)。
// Why 进 Zustand:预览的发起方在右栏(FileTree)、渲染地在中间区(TerminalTabs),跨组件状态,
// 组件局部 state 不再适用(原裁决 7 的前提因布局调整失效,如实登记)。
import type { StateCreator } from 'zustand'
import type { AppState } from './app-store'

export interface FilePreviewSlice {
  previewPath: string | null
  previewName: string
  previewActive: boolean
  previewKind: 'file' | 'git-diff'
  // 预览发起时的仓库根(git-diff 用):git 面板传相对路径 + root,文件面板传绝对路径不带 root。
  // Why 记住 root 而不是让 DiffView 取「当前选中项目」:previewPath 是相对路径,切项目后
  // 用新 root 拉同名相对路径会静默显示另一个项目的差异(T10 评审 Important-2)。
  previewRoot: string | null
  // 打开/切换预览:置路径并激活(重复点击同一文件幂等);显示名 = 路径末段(渲染层无 node:path)
  openPreview: (path: string, kind?: 'file' | 'git-diff', root?: string) => void
  activatePreview: () => void
  deactivatePreview: () => void
  closePreview: () => void
}

export const createFilePreviewSlice: StateCreator<AppState, [], [], FilePreviewSlice> = (set) => ({
  previewPath: null,
  previewName: '',
  previewActive: false,
  previewKind: 'file',
  previewRoot: null,

  openPreview: (path, kind = 'file', root) => {
    set({
      previewPath: path,
      previewName: path.split(/[\\/]+/).pop() ?? path,
      previewActive: true,
      previewKind: kind,
      previewRoot: root ?? null
    })
  },

  activatePreview: () => {
    set({ previewActive: true })
  },

  deactivatePreview: () => {
    set({ previewActive: false })
  },

  closePreview: () => {
    set({
      previewPath: null,
      previewName: '',
      previewActive: false,
      previewKind: 'file',
      previewRoot: null
    })
  }
})
