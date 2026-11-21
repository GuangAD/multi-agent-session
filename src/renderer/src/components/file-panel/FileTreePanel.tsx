// 右栏文件面板:懒展开树(无自身标题行——标题、刷新、打开目录都在窗口标题栏,
// 见 App.tsx;垂直空间全部留给树)
// (spec:components/file-panel/FileTreePanel;T9 评审期用户调整:预览从本面板移到中间区
// 标签页——见 file-preview-slice,本面板只剩树。文件选中态跨组件(右栏点、中间渲染),
// 经 store 的 previewPath 共享,不再用组件局部 state)
import { useEffect, useState } from 'react'
import { useAppStore } from '../../store/app-store'
import { bridge } from '../../ipc/bridge'
import { EmptyState } from '../ui/empty-state'
import { FileTree } from './FileTree'
import type { Project } from '../../../../shared/types'
import type { TreeNode } from '../../../../shared/ipc-contract'

// 把懒加载到的子层挂回树上:只替换目标路径那一层的 children,其余分支原样复用(不可变更新)
function attachChildren(node: TreeNode, targetPath: string, children: TreeNode[]): TreeNode {
  if (node.path !== targetPath) {
    return {
      ...node,
      children: node.children?.map((child) => attachChildren(child, targetPath, children))
    }
  }
  return { ...node, children }
}

export interface FileTreePanelProps {
  // 刷新计数:标题栏的刷新按钮 +1,变化时以 key 重挂内层(展开态与已加载子层随之作废)
  refreshTick: number
}

export function FileTreePanel({ refreshTick }: FileTreePanelProps): React.JSX.Element {
  const projects = useAppStore((state) => state.projects)
  const selectedProjectId = useAppStore((state) => state.selectedProjectId)
  const project = projects.find((item) => item.id === selectedProjectId) ?? null

  // 未选项目:显示空态
  if (!project) {
    return <EmptyState title="先添加项目" hint="在左栏选择一个项目后,这里显示它的文件树" />
  }
  // key = 项目 id + 刷新计数:切换项目或点标题栏刷新时整体重挂,树/展开这些局部 state
  // 自然归零,不必在 effect 里同步 setState 重置(react-hooks/set-state-in-effect)
  return <FileTreePanelProject key={`${project.id}:${refreshTick}`} project={project} />
}

function FileTreePanelProject({ project }: { project: Project }): React.JSX.Element {
  const [tree, setTree] = useState<TreeNode | null>(null)
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set())
  // 选中高亮来源 = 预览切片(预览标签页在中间区,发起在右栏,跨组件经 store 共享)
  const previewPath = useAppStore((state) => state.previewPath)
  const openPreview = useAppStore((state) => state.openPreview)

  // 挂载时拉根层(项目切换经 key 重挂,自然重跑);setState 只在异步回调,
  // cancelled 挡住刷新/卸载后的在途响应(react-hooks/set-state-in-effect)
  useEffect(() => {
    let cancelled = false
    bridge.files
      .tree(project.path)
      .then((next) => {
        if (!cancelled) {
          setTree(next)
        }
      })
      .catch((error) => {
        console.error('文件树加载失败:', error)
      })
    return () => {
      cancelled = true
    }
  }, [project.path])

  // 目录行点击:未加载(children undefined)先懒加载该层再展开;已加载则翻转展开态(裁决 1)
  const toggleDir = (node: TreeNode): void => {
    if (node.children === undefined) {
      void (async () => {
        try {
          const subTree = await bridge.files.tree(node.path)
          setTree((prev) => (prev ? attachChildren(prev, node.path, subTree.children ?? []) : prev))
          setExpandedDirs((prev) => new Set(prev).add(node.path))
        } catch (error) {
          console.error('子目录加载失败:', error)
        }
      })()
      return
    }
    setExpandedDirs((prev) => {
      const next = new Set(prev)
      if (next.has(node.path)) {
        next.delete(node.path)
      } else {
        next.add(node.path)
      }
      return next
    })
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto py-1">
        <FileTree
          tree={tree}
          expandedDirs={expandedDirs}
          selectedPath={previewPath}
          onToggleDir={toggleDir}
          onSelectFile={openPreview}
        />
      </div>
    </div>
  )
}
