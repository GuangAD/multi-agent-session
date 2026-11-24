// 「更多」行内小菜单(spec:components/sidebar/MoreMenu):项目行「…」弹出的两项动作面板——
// 「导入历史会话」开 agent 选择弹窗(import 模式),「移除项目」走既有 removeProject(无确认,行为不变)。
// 开合态归 ProjectGroup 组件本地,关闭即复位;面板外垫透明遮罩,点外部即关闭。
import { Download, Trash2 } from 'lucide-react'
import { useAppStore } from '../../store/app-store'
import type { Project } from '../../../../shared/types'

export function MoreMenu({
  project,
  onClose,
  onRemove
}: {
  project: Project
  onClose: () => void
  onRemove: (id: string) => void
}): React.JSX.Element {
  const openAgentDialog = useAppStore((state) => state.openAgentDialog)

  return (
    <>
      {/* 透明遮罩:叠满整窗接住面板外的任意点击;叠在项目行上,须阻断冒泡避免连带「选中 + 展开切换」 */}
      <div
        className="fixed inset-0 z-40"
        onClick={(event) => {
          event.stopPropagation()
          onClose()
        }}
      />
      <div
        role="menu"
        aria-label={`项目「${project.name}」更多操作`}
        className="absolute top-full right-0 z-50 mt-1 w-44 rounded-md border border-line bg-surface py-1 shadow-lg"
        onClick={(event) => {
          // 面板自身(含 padding 空白)的点击不得冒泡到项目行,否则会连带「选中 + 展开切换」
          event.stopPropagation()
        }}
      >
        <button
          type="button"
          role="menuitem"
          className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-hover"
          onClick={(event) => {
            event.stopPropagation()
            openAgentDialog({ mode: 'import', projectId: project.id })
            onClose()
          }}
        >
          <Download className="size-3.5" aria-hidden />
          导入历史会话
        </button>
        <button
          type="button"
          role="menuitem"
          className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-hover"
          onClick={(event) => {
            event.stopPropagation()
            onRemove(project.id)
            onClose()
          }}
        >
          <Trash2 className="size-3.5" aria-hidden />
          移除项目
        </button>
      </div>
    </>
  )
}
