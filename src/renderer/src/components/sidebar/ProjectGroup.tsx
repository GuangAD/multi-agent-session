// 项目分组:项目行(选中/移除)+ 该项目下的会话行(spec:components/sidebar/ProjectGroup)
// 会话行的状态点来源 = run-state-slice(主进程 state:changed 广播)
import { useState } from 'react'
import { Folder, Trash2 } from 'lucide-react'
import { useAppStore } from '../../store/app-store'
import { SESSION_LIST_COLLAPSED_LIMIT, orderSessionsForDisplay } from '../../session-order'
import { Button } from '../ui/button'
import { ImportMenu } from './ImportMenu'
import { SessionRow } from './SessionRow'
import type { Project, Session } from '../../../../shared/types'

export function ProjectGroup({
  project,
  sessions,
  selected,
  onSelect,
  onRemoveProject,
  onDeleteSession
}: {
  project: Project
  sessions: Session[]
  selected: boolean
  onSelect: (id: string) => void
  onRemoveProject: (id: string) => void
  onDeleteSession: (session: Session) => void
}): React.JSX.Element {
  const tabs = useAppStore((state) => state.tabs)
  const runStates = useAppStore((state) => state.runStates)
  const activeTabId = useAppStore((state) => state.activeTabId)
  const reopenSession = useAppStore((state) => state.reopenSession)
  const renameSession = useAppStore((state) => state.renameSession)
  const [expanded, setExpanded] = useState(false)
  // 最近活动倒序 + 超一屏折叠(T6):展开态是每个项目分组自己的 UI 状态,不落盘
  const ordered = orderSessionsForDisplay(sessions)
  const visibleSessions = expanded ? ordered : ordered.slice(0, SESSION_LIST_COLLAPSED_LIMIT)

  return (
    <li>
      <div
        role="button"
        tabIndex={0}
        aria-pressed={selected}
        className={`group flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 ${
          selected ? 'bg-zinc-200 dark:bg-zinc-800' : 'hover:bg-zinc-200 dark:hover:bg-zinc-800'
        }`}
        onClick={() => onSelect(project.id)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            onSelect(project.id)
          }
        }}
      >
        <Folder className="size-4 shrink-0 text-amber-500" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm">{project.name}</span>
          <span className="block truncate text-xs text-zinc-500 dark:text-zinc-400">
            {project.path}
          </span>
        </span>
        <Button
          variant="ghost"
          aria-label={`移除项目 ${project.name}`}
          className="opacity-0 group-hover:opacity-100"
          onClick={(event) => {
            event.stopPropagation() // 不触发选中
            onRemoveProject(project.id)
          }}
        >
          <Trash2 className="size-4" aria-hidden />
        </Button>
      </div>
      <div className="mt-0.5 pl-4">
        {visibleSessions.length > 0 && (
          <ul className="space-y-0.5">
            {visibleSessions.map((session) => (
              <SessionRow
                key={session.id}
                session={session}
                runState={
                  // 运行状态是「活着的终端」的属性:没有打开的标签页就没有可判定的状态
                  // (顺带把关闭标签页后的退役状态一并藏掉,不留退役红点)
                  tabs.some((tab) => tab.sessionId === session.id)
                    ? runStates[session.id]
                    : undefined
                }
                active={activeTabId === session.id}
                onOpen={() => void reopenSession(session, project)}
                onRename={(title) => void renameSession(session.id, title)}
                onDelete={() => onDeleteSession(session)}
              />
            ))}
          </ul>
        )}
        {ordered.length > SESSION_LIST_COLLAPSED_LIMIT && (
          <button
            type="button"
            className="px-1 py-0.5 text-xs text-zinc-500 hover:underline dark:text-zinc-400"
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? '收起' : `显示更多(${ordered.length - SESSION_LIST_COLLAPSED_LIMIT})`}
          </button>
        )}
        <ImportMenu project={project} />
      </div>
    </li>
  )
}
