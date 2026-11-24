// 变更文件差异视图(T10):中间区预览标签页在 previewKind === 'git-diff' 时渲染本组件
// (spec:components/git-panel/DiffView)。自足取数:root 来自 file-preview-slice 的 previewRoot
// (发起预览时记下的仓库根;缺省退回当前选中项目路径),文件来自同一 store 的 previewPath——
// 两者都不进标签载荷(裁决 7)。
// 行着色:added 绿底 / removed 红底 / context 常规 / other(文件头、hunk 头)淡色。
// Why 外层/内层两层:内层以 `${root}::${path}` 作 key 重挂,读取态(loading/error/lines)
// 随文件或项目切换自然归零,effect 内不必同步 setState(react-hooks/set-state-in-effect,T9 先例)。
// Why root 取自 previewRoot(发起时的仓库根)而不是「当前选中项目」:git 面板给的是相对路径,
// 切项目后用新 root 拉同名相对路径会静默显示另一个项目的差异(T10 评审 Important-2)。
import { useEffect, useState } from 'react'
import { useAppStore } from '../../store/app-store'
import { bridge } from '../../ipc/bridge'
import { parseDiffLines, type DiffLine } from '../../../../shared/git-diff-lines'

// 语义化着色:用 Tailwind 半透明底,深浅色都能读
const LINE_CLASSES: Record<DiffLine['type'], string> = {
  added: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  removed: 'bg-rose-500/15 text-rose-700 dark:text-rose-300',
  context: '',
  other: 'text-ink-muted'
}

export function DiffView(): React.JSX.Element {
  const projects = useAppStore((state) => state.projects)
  const selectedProjectId = useAppStore((state) => state.selectedProjectId)
  const previewPath = useAppStore((state) => state.previewPath)
  const previewRoot = useAppStore((state) => state.previewRoot)
  const project = projects.find((item) => item.id === selectedProjectId) ?? null
  // 优先用发起时的仓库根;老状态(无 root)退回当前项目路径
  const root = previewRoot ?? project?.path ?? null

  if (!root || !previewPath) {
    return (
      <p className="p-4 text-sm text-ink-muted">
        先在右侧 Git 面板选择一个变更文件
      </p>
    )
  }
  return <DiffViewFile key={`${root}::${previewPath}`} root={root} path={previewPath} />
}

interface DiffViewFileProps {
  root: string
  path: string
}

function DiffViewFile({ root, path }: DiffViewFileProps): React.JSX.Element {
  const [lines, setLines] = useState<DiffLine[]>([])
  const [error, setError] = useState<string | null>(null)
  // 初始即加载态:切文件/切项目经外层 key 重挂,无需在 effect 里同步置 true
  const [loading, setLoading] = useState(true)

  // 取数:setState 只在异步回调;cancelled 挡住切换后的迟到响应
  useEffect(() => {
    let cancelled = false
    bridge.git
      .diff({ root, path })
      .then((raw) => {
        if (!cancelled) {
          setLines(parseDiffLines(raw))
          setError(null)
          setLoading(false)
        }
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setLines([])
          setError(cause instanceof Error ? cause.message : String(cause))
          setLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [root, path])

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="shrink-0 border-b border-line px-3 py-1 text-xs text-ink-muted">
        {path}
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {loading ? (
          <p className="p-4 text-sm text-ink-muted">读取差异…</p>
        ) : error ? (
          <p className="p-4 text-sm text-rose-600 dark:text-rose-400">{error}</p>
        ) : lines.length === 0 ? (
          <p className="p-4 text-sm text-ink-muted">
            没有可显示的差异(未跟踪的新文件暂存后可见)
          </p>
        ) : (
          <div className="min-w-max font-mono text-xs leading-5">
            {lines.map((line, index) => (
              <div key={index} className={`whitespace-pre ${LINE_CLASSES[line.type]}`}>
                {line.text === '' ? ' ' : line.text}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
