// 项目分组:项目行(chevron / 常驻「+」「…」)+ 该项目下可折叠的会话行(spec:components/sidebar/ProjectGroup)
// 点行本体 = 选中 + 项目展开态取反(一次点击同时完成);行上按钮阻断冒泡,不改变选中。
// 展开态是渲染层 UI 状态,不落盘(T6 既有约定),默认展开;会话行的 working 动画来源 = run-state-slice(主进程 state:changed 广播)
import { useCallback, useState } from 'react'
import { ChevronDown, ChevronRight, Ellipsis, Plus } from 'lucide-react'
import { useAppStore } from '../../store/app-store'
import { SESSION_LIST_COLLAPSED_LIMIT, orderSessionsForDisplay } from '../../session-order'
import { Button } from '../ui/button'
import { MoreMenu } from './MoreMenu'
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
  const openAgentDialog = useAppStore((state) => state.openAgentDialog)
  // 项目展开态(默认展开,点行切换)与「更多」菜单开合态,都是组件本地 UI 状态,不落盘
  const [expanded, setExpanded] = useState(true)
  const [moreOpen, setMoreOpen] = useState(false)
  // 「更多」面板的锚点 = 触发按钮元素(fixed 定位按它的视口矩形算坐标,见 MoreMenu)
  const [moreAnchor, setMoreAnchor] = useState<HTMLElement | null>(null)
  // 关闭收口在一处:面板开合态与锚点必须同步复位,否则下次打开会按旧矩形定位
  const closeMore = useCallback(() => {
    setMoreOpen(false)
    setMoreAnchor(null)
  }, [])
  // 会话列表超一屏的「显示更多」折叠态(T6 既有逻辑原样保留),默认折叠
  const [listExpanded, setListExpanded] = useState(false)
  // 最近活动倒序 + 超一屏折叠(T6):顺序只由这里统一决定
  const ordered = orderSessionsForDisplay(sessions)
  const visibleSessions = listExpanded ? ordered : ordered.slice(0, SESSION_LIST_COLLAPSED_LIMIT)

  // 一次点击同时完成「选中」与「展开/折叠」(brief 关键决策)
  const toggleRow = (): void => {
    onSelect(project.id)
    setExpanded((value) => !value)
  }

  return (
    <li>
      <div
        role="button"
        tabIndex={0}
        aria-pressed={selected}
        aria-expanded={expanded}
        className={`group flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 ${
          selected ? 'bg-hover' : 'hover:bg-hover'
        }`}
        onClick={toggleRow}
        onKeyDown={(event) => {
          // 焦点在行内嵌套按钮(+/…)上时,Enter/Space 是按钮自身的激活键:
          // 不隔离会先冒泡触发行切换(改选中+翻转展开),再执行按钮动作
          if (event.target !== event.currentTarget) {
            return
          }
          if (event.key === 'Enter' || event.key === ' ') {
            toggleRow()
          }
        }}
      >
        {expanded ? (
          <ChevronDown className="size-4 shrink-0 text-ink-muted" aria-hidden />
        ) : (
          <ChevronRight className="size-4 shrink-0 text-ink-muted" aria-hidden />
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm">{project.name}</span>
          <span className="block truncate text-xs text-ink-muted">
            {project.path}
          </span>
        </span>
        {/* 常驻动作区:按钮阻断冒泡,不触发选中与展开切换(「更多」面板已改 fixed 定位,不再依赖这里的 relative) */}
        <div className="relative flex items-center gap-0.5">
          <Button
            variant="ghost"
            aria-label={`新建会话:${project.name}`}
            className="!px-1.5 !py-1"
            onClick={(event) => {
              event.stopPropagation()
              openAgentDialog({ mode: 'new', projectId: project.id })
            }}
          >
            <Plus className="size-4" aria-hidden />
          </Button>
          <Button
            variant="ghost"
            aria-label={`更多操作:${project.name}`}
            aria-haspopup="menu"
            aria-expanded={moreOpen}
            className="!px-1.5 !py-1"
            onClick={(event) => {
              event.stopPropagation()
              setMoreAnchor(event.currentTarget)
              setMoreOpen(true)
            }}
          >
            <Ellipsis className="size-4" aria-hidden />
          </Button>
          {moreOpen && moreAnchor !== null && (
            <MoreMenu
              project={project}
              anchor={moreAnchor}
              onClose={closeMore}
              onRemove={onRemoveProject}
            />
          )}
        </div>
      </div>
      {/* 项目折叠时会话列表整体不渲染;展开后的排序与「显示更多」沿用 T6 既有逻辑 */}
      {expanded && (
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
              className="px-1 py-0.5 text-xs text-ink-muted hover:underline"
              onClick={() => setListExpanded((value) => !value)}
            >
              {listExpanded ? '收起' : `显示更多(${ordered.length - SESSION_LIST_COLLAPSED_LIMIT})`}
            </button>
          )}
        </div>
      )}
    </li>
  )
}
