// Git 变更列表(T10):已暂存 / 未暂存的变更两组,每项带暂存或取消暂存按钮
// (spec:components/git-panel/StatusList)。分组依据 = porcelain 的 X/Y 字符:
// staged 非空 → 已暂存组;unstaged 非空 → 未暂存组。同一文件可同时出现在两组(MM 码)。
import { Minus, Plus } from 'lucide-react'
import type { GitStatus } from '../../../../shared/ipc-contract'
import { Button } from '../ui/button'

// 状态字符 → 中文标签(porcelain 的 XY 字符集;未跟踪记 '?')
const STATUS_LABEL: Record<string, string> = {
  M: '修改',
  A: '新增',
  D: '删除',
  R: '重命名',
  C: '复制',
  U: '冲突',
  T: '类型变更',
  '?': '未跟踪'
}

function statusText(code: string): string {
  return STATUS_LABEL[code] ?? code
}

export interface StatusListProps {
  status: GitStatus
  selectedPath: string | null
  onSelect: (path: string) => void
  onStage: (paths: string[]) => void
  onUnstage: (paths: string[]) => void
}

export function StatusList({
  status,
  selectedPath,
  onSelect,
  onStage,
  onUnstage
}: StatusListProps): React.JSX.Element {
  // 分组:staged 有字符(非空格)进已暂存;unstaged 有字符进未暂存。未跟踪条目 staged 为空串
  // 之外的特殊值不参与——解析层已把它规范成 staged=' '、unstaged='?'
  const staged = status.entries.filter((entry) => entry.staged.trim() !== '')
  const unstaged = status.entries.filter((entry) => entry.unstaged.trim() !== '')

  if (status.entries.length === 0) {
    return <p className="px-2 py-2 text-xs text-zinc-500 dark:text-zinc-400">工作区干净,没有变更</p>
  }

  return (
    <div className="flex flex-col gap-2">
      {staged.length > 0 && (
        <section>
          <h4 className="px-2 text-xs font-medium text-zinc-500 dark:text-zinc-400">已暂存</h4>
          <ul>
            {staged.map((entry) => (
              <li
                key={`staged-${entry.path}`}
                className={`flex items-center gap-1 rounded px-2 py-0.5 text-xs ${
                  selectedPath === entry.path ? 'bg-zinc-200 dark:bg-zinc-700' : ''
                }`}
              >
                <button
                  type="button"
                  className="min-w-0 flex-1 truncate text-left"
                  title={entry.path}
                  onClick={() => onSelect(entry.path)}
                >
                  {entry.path}
                </button>
                <span className="shrink-0 text-zinc-400">{statusText(entry.staged)}</span>
                <Button
                  variant="ghost"
                  aria-label={`取消暂存 ${entry.path}`}
                  className="!px-1 !py-0.5"
                  onClick={() => onUnstage([entry.path])}
                >
                  <Minus className="size-3.5" aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {unstaged.length > 0 && (
        <section>
          <h4 className="px-2 text-xs font-medium text-zinc-500 dark:text-zinc-400">
            未暂存的变更
          </h4>
          <ul>
            {unstaged.map((entry) => (
              <li
                key={`unstaged-${entry.path}`}
                className={`flex items-center gap-1 rounded px-2 py-0.5 text-xs ${
                  selectedPath === entry.path ? 'bg-zinc-200 dark:bg-zinc-700' : ''
                }`}
              >
                <button
                  type="button"
                  className="min-w-0 flex-1 truncate text-left"
                  title={entry.path}
                  onClick={() => onSelect(entry.path)}
                >
                  {entry.path}
                </button>
                <span className="shrink-0 text-zinc-400">{statusText(entry.unstaged)}</span>
                <Button
                  variant="ghost"
                  aria-label={`暂存 ${entry.path}`}
                  className="!px-1 !py-0.5"
                  onClick={() => onStage([entry.path])}
                >
                  <Plus className="size-3.5" aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
