// 会话行:agent 徽标 + 显示名 + 运行状态点 + 行内重命名 + 删除入口
// 重命名只改应用侧显示名(brief 第 5 节),agent 侧原名与对话 id 不受影响
// 状态点语义(working 绿 / waiting 橙 / idle 灰 / exited 红)来自 state:changed 广播,
// 取代 T4 的「有活动标签页」圆点(标签页存在与否已由标签栏表达,一行不留两个点)
import { useState } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import { AgentBadge } from '../../agents-display'
import { RUN_STATE_DISPLAY } from '../../run-state-display'
import { Button } from '../ui/button'
import type { Session, SessionRunState } from '../../../../shared/types'

export function SessionRow({
  session,
  runState,
  active,
  onOpen,
  onRename,
  onDelete
}: {
  session: Session
  // 缺项 = 尚未收到该会话的首次状态广播(不画点)
  runState?: SessionRunState
  active: boolean
  onOpen: () => void
  onRename: (title: string) => void
  onDelete: () => void
}): React.JSX.Element {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(session.title)

  const startEditing = (): void => {
    setDraft(session.title)
    setEditing(true)
  }

  const commit = (): void => {
    setEditing(false)
    const title = draft.trim()
    // 空名与未改动的提交都按取消处理(显示名不能为空)
    if (title !== '' && title !== session.title) {
      onRename(title)
    }
  }

  return (
    <li
      className={`group flex items-center gap-1 rounded px-1 ${
        active ? 'bg-zinc-200 dark:bg-zinc-700' : 'hover:bg-zinc-200 dark:hover:bg-zinc-800'
      }`}
    >
      {editing ? (
        <input
          autoFocus
          aria-label={`重命名会话 ${session.title}`}
          className="my-0.5 min-w-0 flex-1 rounded border border-zinc-300 bg-transparent px-1.5 py-0.5 text-sm outline-none dark:border-zinc-600"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              commit()
            } else if (event.key === 'Escape') {
              setEditing(false) // 取消:回退草稿,不落盘
            }
          }}
        />
      ) : (
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-1.5 py-1 text-left"
          title={
            session.externalTitle
              ? `${session.title}(原名:${session.externalTitle})`
              : session.title
          }
          onClick={onOpen}
        >
          {/* Session 只存 agentId;徽标首字母由 id 推导(agents-display 的 icon 语义即首字母) */}
          <AgentBadge agentId={session.agentId} icon={session.agentId.slice(0, 1).toUpperCase()} />
          <span className="min-w-0 flex-1 truncate text-sm">{session.title}</span>
          {runState && (
            <span
              role="img"
              aria-label={`运行状态:${RUN_STATE_DISPLAY[runState].label}`}
              title={`运行状态:${RUN_STATE_DISPLAY[runState].label}`}
              className={`size-1.5 shrink-0 rounded-full ${RUN_STATE_DISPLAY[runState].dotClassName}`}
            />
          )}
        </button>
      )}
      <Button
        variant="ghost"
        aria-label={`重命名会话 ${session.title}`}
        className="opacity-0 group-hover:opacity-100"
        onClick={startEditing}
      >
        <Pencil className="size-3.5" aria-hidden />
      </Button>
      <Button
        variant="ghost"
        aria-label={`删除会话 ${session.title}`}
        className="opacity-0 group-hover:opacity-100"
        onClick={onDelete}
      >
        <Trash2 className="size-3.5" aria-hidden />
      </Button>
    </li>
  )
}
