// 提交框(T10):多行提交说明 + 提交按钮(spec:components/git-panel/CommitBox)
// 空说明禁用提交;提交成功后由父组件清空(message 受控于 GitPanel,便于提交后重置)
import { Button } from '../ui/button'

export interface CommitBoxProps {
  // 当前分支(spec「提交框显示当前分支」);空仓库/unborn HEAD 时由上层给 'main'
  branch: string
  message: string
  onMessageChange: (message: string) => void
  onCommit: () => void
  busy: boolean
  stagedCount: number
}

export function CommitBox({
  branch,
  message,
  onMessageChange,
  onCommit,
  busy,
  stagedCount
}: CommitBoxProps): React.JSX.Element {
  const canCommit = message.trim() !== '' && stagedCount > 0 && !busy
  return (
    <div className="flex flex-col gap-1 px-2">
      <textarea
        className="h-16 w-full resize-none rounded border border-zinc-300 bg-transparent px-2 py-1 text-xs outline-none focus:border-zinc-500 dark:border-zinc-600"
        placeholder="提交说明(中文或英文均可)"
        value={message}
        onChange={(event) => onMessageChange(event.target.value)}
      />
      <div className="flex items-center gap-2">
        <Button className="flex-1" disabled={!canCommit} onClick={onCommit}>
          {busy ? '提交中…' : '提交'}
        </Button>
        <span className="shrink-0 text-xs text-zinc-500 dark:text-zinc-400">
          {branch || '无分支'} · 已暂存 {stagedCount}
        </span>
      </div>
    </div>
  )
}
