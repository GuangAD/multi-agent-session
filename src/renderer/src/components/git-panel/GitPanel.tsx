// Git 面板(T10):分支下拉 + 变更列表 + 提交框(无自身标题行——标题与刷新在窗口标题栏,
// 见 App.tsx;垂直空间全部留给内容)(spec:components/git-panel/GitPanel)
// 布局:右栏单面板,内部自滚动。
// 取数:由 App 下传的 root(当前运行目录:活动会话的 worktree 或项目根)作为 git root;
// 挂载与每次操作后重拉状态。
// 「不是 Git 仓库」不是错误横幅,而是面板内的空态文案(裁决 6)。
import { useEffect, useState } from 'react'
import { useAppStore } from '../../store/app-store'
import { bridge } from '../../ipc/bridge'
import { EmptyState } from '../ui/empty-state'
import { CommitBox } from './CommitBox'
import { StatusList } from './StatusList'
import type { GitStatus } from '../../../../shared/ipc-contract'

// simple-git 对非仓库目录的报错文案("not a git repository" 出现在多数 git 版本的 message 里)
function isNotRepo(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return /not a git repository/i.test(message)
}

export interface GitPanelProps {
  // git root:App 算出的「当前运行目录」(活动会话的 worktree 或项目根);null = 空态
  root: string | null
  // 刷新计数:标题栏的刷新按钮 +1,变化时以 key 重挂内层(重新拉状态与分支)
  refreshTick: number
}

export function GitPanel({ root, refreshTick }: GitPanelProps): React.JSX.Element {
  const previewPath = useAppStore((state) => state.previewPath)
  const openPreview = useAppStore((state) => state.openPreview)

  // 目录为空:显示空态(没有活动会话也没有选中项目)
  if (!root) {
    return <EmptyState title="先添加项目" hint="在左栏选择一个项目后,这里显示它的 Git 状态" />
  }
  // key = 根目录 + 刷新计数:切换会话/项目或点标题栏刷新时整体重挂,
  // 状态/分支/提交说明这些局部 state 自然归零
  return (
    <GitPanelRoot
      key={`${root}:${refreshTick}`}
      root={root}
      previewPath={previewPath}
      onSelectFile={(path) => openPreview(path, 'git-diff', root)}
    />
  )
}

interface GitPanelRootProps {
  root: string
  previewPath: string | null
  onSelectFile: (path: string) => void
}

function GitPanelRoot({ root, previewPath, onSelectFile }: GitPanelRootProps): React.JSX.Element {
  const [status, setStatus] = useState<GitStatus | null>(null)
  const [branches, setBranches] = useState<{ current: string; all: string[] } | null>(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [notRepo, setNotRepo] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 重拉状态与分支:操作后与手动刷新共用(返回 promise,操作路径 await 它,
  // 避免 busy 在刷新完成前先转 false —— T10 评审 Minor-7)
  const reload = (): Promise<void> => {
    return bridge.git
      .status(root)
      .then((next) => {
        setStatus(next)
        setNotRepo(false)
        setError(null)
        return bridge.git.branches(root)
      })
      .then((next) => {
        setBranches(next)
      })
      .catch((cause: unknown) => {
        if (isNotRepo(cause)) {
          setNotRepo(true)
          setStatus(null)
          return
        }
        setError(cause instanceof Error ? cause.message : String(cause))
      })
  }

  // 挂载时拉一次(切项目经 key 重挂);setState 只在异步回调内(react-hooks/set-state-in-effect)
  useEffect(() => {
    let cancelled = false
    bridge.git
      .status(root)
      .then((next) => {
        if (cancelled) {
          return
        }
        setStatus(next)
        setNotRepo(false)
        setError(null)
        return bridge.git.branches(root)
      })
      .then((next) => {
        if (!cancelled && next) {
          setBranches(next)
        }
      })
      .catch((cause: unknown) => {
        if (cancelled) {
          return
        }
        if (isNotRepo(cause)) {
          setNotRepo(true)
          setStatus(null)
          return
        }
        setError(cause instanceof Error ? cause.message : String(cause))
      })
    return () => {
      cancelled = true
    }
  }, [root])

  const runAction = async (action: () => Promise<void>): Promise<void> => {
    setBusy(true)
    try {
      await action()
      await reload()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  const handleCommit = (): void => {
    void runAction(async () => {
      await bridge.git.commit({ root, message: message.trim() })
      setMessage('')
    })
  }

  if (notRepo) {
    return <EmptyState title="此目录不是 Git 仓库" hint="初始化仓库后这里会显示变更与提交" />
  }

  const stagedCount = status?.entries.filter((entry) => entry.staged.trim() !== '').length ?? 0

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 px-2 pb-1 pt-2">
        <label className="flex items-center gap-1 text-xs text-ink-muted">
          <span className="shrink-0">分支</span>
          <select
            className="min-w-0 flex-1 rounded border border-line bg-transparent px-1 py-0.5 text-xs "
            value={branches?.current ?? ''}
            disabled={busy || !branches}
            onChange={(event) => {
              const branch = event.target.value
              if (branch && branch !== branches?.current) {
                void runAction(() => bridge.git.checkout({ root, branch }))
              }
            }}
          >
            {(branches?.all ?? []).map((branch) => (
              <option key={branch} value={branch}>
                {branch}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && (
        <p className="shrink-0 px-3 pb-1 text-xs text-rose-600 dark:text-rose-400">{error}</p>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto py-1">
        {status && (
          <StatusList
            status={status}
            selectedPath={previewPath}
            onSelect={onSelectFile}
            onStage={(paths) => void runAction(() => bridge.git.stage({ root, paths }))}
            onUnstage={(paths) => void runAction(() => bridge.git.unstage({ root, paths }))}
          />
        )}
      </div>

      <div className="shrink-0 border-t border-line py-2">
        <CommitBox
          branch={branches?.current || status?.branch || ''}
          message={message}
          onMessageChange={setMessage}
          onCommit={handleCommit}
          busy={busy}
          stagedCount={stagedCount}
        />
      </div>
    </div>
  )
}
