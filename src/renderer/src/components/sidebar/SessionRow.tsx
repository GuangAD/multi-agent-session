// 会话行:agent 徽标 + 显示名 + 工作中旋转动画 + 行内重命名 + 删除入口
// worktree 会话在标题下多一行分支小字(brief 第 5 节:看得出哪条会话在 worktree 里),与项目行的
// 「名称 / 路径」同一层级(brief 第 5 节)。
// 重命名只改应用侧显示名(brief 第 5 节),agent 侧原名与对话 id 不受影响
// working 动画来自主进程 state:changed 广播(渲染层不自行判定);其余态与缺省不画
// 标签页存在与否已由标签栏表达,行内不再留状态点
import { useEffect, useRef, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { AgentBadge } from '../../agents-display'
import { useAppStore } from '../../store/app-store'
import { Button } from '../ui/button'
import type { Session, SessionRunState } from '../../../../shared/types'

// CLI 风格 spinner:braille 点阵逐帧旋转(与 agent CLI 的 working spinner 同形)
const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
const SPINNER_FRAME_MS = 80

export function SessionRow({
  session,
  runState,
  active,
  onOpen,
  onRename,
  onDelete
}: {
  session: Session
  // 缺项 = 尚未收到该会话的首次状态广播(不画动画)
  runState?: SessionRunState
  active: boolean
  onOpen: () => void
  onRename: (title: string) => void
  onDelete: () => void
}): React.JSX.Element {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(session.title)
  const [spinnerFrame, setSpinnerFrame] = useState(0)
  // 单击打开延后 200ms 给双击消歧;进入编辑或卸载时清掉,避免后续误打开
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Session 只存 agentId:载荷经 store 查找(T2);未知 agent 返回 undefined → 全缺省,徽标走中性兜底砖
  const agent = useAppStore((state) => state.agentById(session.agentId))

  useEffect(
    () => () => {
      if (openTimer.current !== null) {
        clearTimeout(openTimer.current)
      }
    },
    []
  )

  // spinner 帧驱动:仅 working 时按固定间隔推进 braille 帧,其余态停表(省去后台无谓重渲染)
  useEffect(() => {
    if (runState !== 'working') {
      return
    }
    const timer = setInterval(() => {
      setSpinnerFrame((frame) => (frame + 1) % SPINNER_FRAMES.length)
    }, SPINNER_FRAME_MS)
    return () => clearInterval(timer)
  }, [runState])

  const cancelOpen = (): void => {
    if (openTimer.current !== null) {
      clearTimeout(openTimer.current)
      openTimer.current = null
    }
  }

  const scheduleOpen = (): void => {
    cancelOpen()
    openTimer.current = setTimeout(() => {
      openTimer.current = null
      onOpen()
    }, 200)
  }

  const startEditing = (): void => {
    cancelOpen()
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
      className={`group flex items-center gap-1 rounded px-1 py-1 ${
        active ? 'bg-hover' : 'hover:bg-hover'
      }`}
    >
      {editing ? (
        <input
          autoFocus
          aria-label={`重命名会话 ${session.title}`}
          className="my-0.5 min-w-0 flex-1 rounded border border-line bg-transparent px-1.5 py-0.5 text-sm outline-none "
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
          onClick={scheduleOpen}
        >
          {runState === 'working' && (
            <span
              className="shrink-0 font-mono text-emerald-500"
              aria-label="工作中"
              role="img"
            >
              {SPINNER_FRAMES[spinnerFrame]}
            </span>
          )}
          {/* 载荷驱动:icon/color 从 store 载荷传入;name 未命中回落 agentId——未知 agent 也渲染首字母砖 */}
          <AgentBadge
            icon={agent?.def.icon}
            color={agent?.def.color}
            name={agent?.def.name ?? session.agentId}
          />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm" onDoubleClick={startEditing}>
              {session.title}
            </span>
            {/* 分支名与会话记录同源(session.worktree,无 worktree 的会话整行不渲染);
                目录名即分支名,故这里只显示 branch,与项目行路径同为 text-xs 次级行 */}
            {session.worktree && (
              <span className="block truncate text-xs text-ink-muted">
                {session.worktree.branch}
              </span>
            )}
          </span>
        </button>
      )}
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
