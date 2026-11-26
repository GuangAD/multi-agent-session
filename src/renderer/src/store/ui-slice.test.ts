// ui-slice 测试(T1):agent 选择弹窗的「弹窗描述」状态设值/清空语义。
// 期望值来源:T1 测试规格用例表(约定 + 手算字面量),不用被测代码同款算法重算期望。
import { describe, expect, it } from 'vitest'
import { create, type StateCreator } from 'zustand'
import { createUiSlice, type UiSlice } from './ui-slice'

// 切片按 AppState 上下文声明(StateCreator<AppState>);单测只装这一个切片,
// 以 StateCreator<UiSlice> 形态断言复用——行为等价,类型面收窄(与 sessions-slice.test.ts 同款)
const sliceCreator = createUiSlice as unknown as StateCreator<UiSlice, [], []>

function makeStore() {
  return create<UiSlice>()(sliceCreator)
}

describe('agentDialog 弹窗描述状态', () => {
  it('用例 1:初始 store 的 agentDialog 为 null(未开弹窗)', () => {
    const store = makeStore()
    expect(store.getState().agentDialog).toBeNull()
  })

  it('用例 2:openAgentDialog 后 agentDialog 深等于传入描述', () => {
    const store = makeStore()
    store.getState().openAgentDialog({ mode: 'new', projectId: 'p1' })
    expect(store.getState().agentDialog).toEqual({ mode: 'new', projectId: 'p1' })
  })

  it('用例 3:打开后 closeAgentDialog,agentDialog 回到 null', () => {
    const store = makeStore()
    store.getState().openAgentDialog({ mode: 'new', projectId: 'p1' })
    store.getState().closeAgentDialog()
    expect(store.getState().agentDialog).toBeNull()
  })

  it('用例 4:已开着再开另一个描述:整体覆盖,不残留旧字段', () => {
    const store = makeStore()
    store.getState().openAgentDialog({ mode: 'new', projectId: 'p1' })
    store.getState().openAgentDialog({ mode: 'import', projectId: 'p2' })
    // toEqual 校验整个对象形状:若残留 mode:'new' 或合并出多余字段即转红
    expect(store.getState().agentDialog).toEqual({ mode: 'import', projectId: 'p2' })
  })

  it('用例 5:初始 store 直接 closeAgentDialog:仍为 null 且不抛错(幂等)', () => {
    const store = makeStore()
    expect(() => store.getState().closeAgentDialog()).not.toThrow()
    expect(store.getState().agentDialog).toBeNull()
  })
})

// 期望值来源:T4 测试规格用例 4/5(手算字面量 + 幂等约定)。与 agentDialog 同款:
// 描述整体覆盖式读写,目标项目显式记在描述里,不依赖侧栏选中态。
describe('worktree 弹窗开合', () => {
  it('用例 4:openWorktreeDialog 后描述为该项目', () => {
    const store = makeStore()
    store.getState().openWorktreeDialog({ projectId: 'p1' })
    // toEqual 校验整个对象形状:多带字段(如把项目路径也塞进描述)即转红
    expect(store.getState().worktreeDialog).toEqual({ projectId: 'p1' })
  })

  it('用例 5:关闭两次都得到 null 且不抛(幂等)', () => {
    const store = makeStore()
    // 先把弹窗置为打开态(等价于 openWorktreeDialog 的效果),再连关两次:
    // 关闭动作必须真的把它置 null,no-op 实现会在第一次 close 后仍非 null 而转红
    store.setState({ worktreeDialog: { projectId: 'p1' } })

    store.getState().closeWorktreeDialog()
    expect(store.getState().worktreeDialog).toBeNull()

    expect(() => store.getState().closeWorktreeDialog()).not.toThrow()
    expect(store.getState().worktreeDialog, '重复关闭保持 null').toBeNull()
  })
})
