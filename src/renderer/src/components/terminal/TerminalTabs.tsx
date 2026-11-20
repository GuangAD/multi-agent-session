// 终端区:标签页栏 + 每会话一个常驻 TerminalView(tab 切换仅切可见性)
// scrollback 取 settings(默认 10000);设置界面属后续任务,本任务只读一次
import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { useAppStore } from '../../store/app-store'
import { bridge } from '../../ipc/bridge'
import { EmptyState } from '../ui/empty-state'
import { TerminalView } from './TerminalView'

// spec 默认值:xterm scrollback 默认 10000 行(settings 缺读时兜底,与 DEFAULT_STORE 一致)
const FALLBACK_SCROLLBACK = 10000

export function TerminalTabs(): React.JSX.Element {
  const tabs = useAppStore((state) => state.tabs)
  const activeTabId = useAppStore((state) => state.activeTabId)
  const projects = useAppStore((state) => state.projects)
  const setActiveTab = useAppStore((state) => state.setActiveTab)
  const closeTab = useAppStore((state) => state.closeTab)
  // scrollback 是创建期参数:tab 挂上后即取 store 设置值(只读一次,无设置界面不会变)
  const [scrollback, setScrollback] = useState(FALLBACK_SCROLLBACK)

  useEffect(() => {
    let cancelled = false
    bridge.settings
      .get()
      .then((settings) => {
        if (!cancelled) {
          setScrollback(settings.scrollbackRows)
        }
      })
      .catch((error) => {
        console.error('读取设置失败,scrollback 用默认值:', error)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      {tabs.length > 0 && (
        <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-zinc-200 px-2 py-1 dark:border-zinc-700">
          {tabs.map((tab) => {
            const active = tab.session.id === activeTabId
            const projectName = projects.find((p) => p.id === tab.session.projectId)?.name
            return (
              <div
                key={tab.session.id}
                className={`flex shrink-0 items-center gap-1.5 rounded px-2 py-1 text-sm ${
                  active
                    ? 'bg-zinc-200 dark:bg-zinc-700'
                    : 'text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800'
                }`}
              >
                <button
                  type="button"
                  className="flex items-center gap-1.5 truncate"
                  onClick={() => setActiveTab(tab.session.id)}
                >
                  <span className="max-w-40 truncate">{tab.session.title}</span>
                  {projectName && (
                    <span className="max-w-28 truncate text-xs text-zinc-500 dark:text-zinc-400">
                      {projectName}
                    </span>
                  )}
                  {tab.runState === 'exited' && (
                    <span className="text-xs text-zinc-400 dark:text-zinc-500">已退出</span>
                  )}
                </button>
                <button
                  type="button"
                  aria-label={`关闭会话 ${tab.session.title}`}
                  className="rounded p-0.5 text-zinc-400 hover:bg-zinc-300 hover:text-zinc-700 dark:hover:bg-zinc-600 dark:hover:text-zinc-200"
                  onClick={() => void closeTab(tab.session.id)}
                >
                  <X className="size-3.5" aria-hidden />
                </button>
              </div>
            )
          })}
        </div>
      )}
      {tabs.length === 0 ? (
        <EmptyState title="没有打开的会话" hint="从左栏「新建会话」选择一个 agent 开始" />
      ) : (
        tabs.map((tab) => (
          <TerminalView
            key={tab.session.id}
            sessionId={tab.session.id}
            active={tab.session.id === activeTabId}
            scrollback={scrollback}
          />
        ))
      )}
    </div>
  )
}
