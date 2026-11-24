// 文件树递归渲染:目录行点开/收起,文件行点击选中预览,缩进层级(spec:components/file-panel/FileTree)
// children === undefined = 未扫描层,显示展开箭头,点开由 FileTreePanel 懒加载(controller 裁决 1)
import { ChevronDown, ChevronRight } from 'lucide-react'
import { EmptyState } from '../ui/empty-state'
import type { TreeNode } from '../../../../shared/ipc-contract'

export interface FileTreeProps {
  tree: TreeNode | null
  expandedDirs: Set<string>
  selectedPath: string | null
  onToggleDir: (node: TreeNode) => void
  onSelectFile: (path: string) => void
}

export function FileTree(props: FileTreeProps): React.JSX.Element | null {
  const { tree } = props
  if (tree === null) {
    return null // 根层扫描中:不渲染(单层扫描很快,无需加载态)
  }
  if (tree.children === undefined || tree.children.length === 0) {
    return (
      <EmptyState title="此项目没有文件" hint="目录为空,或仅含被忽略的目录(.git/node_modules 等)" />
    )
  }
  return (
    <ul className="p-1">
      {tree.children.map((child) => (
        <TreeRow key={child.path} node={child} {...props} />
      ))}
    </ul>
  )
}

function TreeRow({ node, ...rest }: FileTreeProps & { node: TreeNode }): React.JSX.Element {
  const { expandedDirs, selectedPath, onToggleDir, onSelectFile } = rest
  const children = node.children
  const isDir = node.kind === 'dir'
  const expanded = expandedDirs.has(node.path)
  const selected = !isDir && node.path === selectedPath

  return (
    <li>
      <div
        role="button"
        tabIndex={0}
        aria-expanded={isDir ? expanded : undefined}
        aria-pressed={isDir ? undefined : selected}
        className={`flex cursor-pointer items-center gap-1 rounded px-1 py-0.5 ${
          selected ? 'bg-hover' : 'hover:bg-hover'
        }`}
        onClick={() => (isDir ? onToggleDir(node) : onSelectFile(node.path))}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            if (isDir) {
              onToggleDir(node)
            } else {
              onSelectFile(node.path)
            }
          }
        }}
      >
        {/* 箭头位:目录未加载/已收起 → 右箭头;已展开 → 下箭头;空目录与文件 → 占位对齐 */}
        <span className="flex size-4 shrink-0 items-center justify-center">
          {isDir && (children === undefined || children.length > 0) ? (
            expanded ? (
              <ChevronDown className="size-3.5 text-ink-muted" aria-hidden />
            ) : (
              <ChevronRight className="size-3.5 text-ink-muted" aria-hidden />
            )
          ) : null}
        </span>
        <span className="min-w-0 truncate text-sm">{node.name}</span>
      </div>
      {isDir && expanded && children !== undefined && children.length > 0 && (
        <ul className="pl-4">
          {children.map((child) => (
            <TreeRow key={child.path} node={child} {...rest} />
          ))}
        </ul>
      )}
    </li>
  )
}
