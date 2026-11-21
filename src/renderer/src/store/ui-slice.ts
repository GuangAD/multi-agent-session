// UI 交互切片(T11):跨组件的界面开关。
// 目前只有「新建会话」菜单是否展开——快捷键 Ctrl+N 在 App 的全局按键处理里触发它,
// 而菜单本体在侧栏(NewSessionMenu)。两者不在同一组件树分支,故经 store 共享。
import type { StateCreator } from 'zustand'
import type { AppState } from './app-store'

export interface UiSlice {
  // 新建会话菜单展开态(侧栏菜单与标题栏/快捷键共用)
  newSessionMenuOpen: boolean
  setNewSessionMenuOpen: (open: boolean) => void
}

export const createUiSlice: StateCreator<AppState, [], [], UiSlice> = (set) => ({
  newSessionMenuOpen: false,
  setNewSessionMenuOpen: (open) => {
    set({ newSessionMenuOpen: open })
  }
})
