// 项目分组:项目行(选中/移除)+ 该项目下的会话行(spec:components/sidebar/ProjectGroup)
// 运行中标记来源 = 切片里挂在该记录上的标签页(有活动标签页即运行中)
import { Folder, Trash2 } from 'lucide-react'
import { useAppStore } from '../../store/app-store'
import { Button } from '../ui/button'
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
  const activeTabId = useAppStore((state) => state.activeTabId)
  const reopenSession = useAppStore((state) => state.reopenSession)
  const renameSession = useAppStore((state) => state.renameSession)

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
      {sessions.length > 0 && (
        <ul className="mt-0.5 space-y-0.5 pl-4">
          {sessions.map((session) => (
            <SessionRow
              key={session.id}
              session={session}
              running={tabs.some((tab) => tab.sessionId === session.id)}
              active={activeTabId === session.id}
              onOpen={() => void reopenSession(session, project)}
              onRename={(title) => void renameSession(session.id, title)}
              onDelete={() => onDeleteSession(session)}
            />
          ))}
        </ul>
      )}
    </li>
  )
}
