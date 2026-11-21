// 终端区:标签页栏 + 每会话一个常驻 TerminalView(tab 切换仅切可见性)
// scrollback 取 settings(默认 10000);设置界面属后续任务,本任务只读一次
import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { useAppStore } from '../../store/app-store'
import { bridge } from '../../ipc/bridge'
import { EmptyState } from '../ui/empty-state'
import { TerminalView } from './TerminalView'
import { setTerminalReadyHandler } from './use-terminal'
import { RUN_STATE_DISPLAY } from '../../run-state-display'
import { FilePreview } from '../file-panel/FilePreview'
import { DiffView } from '../git-panel/DiffView'

// spec 默认值:xterm scrollback 默认 10000 行(settings 缺读时兜底,与 DEFAULT_STORE 一致)
const FALLBACK_SCROLLBACK = 10000

export function TerminalTabs(): React.JSX.Element {
  const tabs = useAppStore((state) => state.tabs)
  const records = useAppStore((state) => state.sessions)
  const activeTabId = useAppStore((state) => state.activeTabId)
  const runStates = useAppStore((state) => state.runStates)
  const projects = useAppStore((state) => state.projects)
  const setActiveTab = useAppStore((state) => state.setActiveTab)
  // 文件预览标签页(T9 评审期调整):预览发起在右栏、渲染在中间区,状态经 file-preview-slice 共享
  const previewPath = useAppStore((state) => state.previewPath)
  const previewName = useAppStore((state) => state.previewName)
  const previewKind = useAppStore((state) => state.previewKind)
  const previewActive = useAppStore((state) => state.previewActive)
  const activatePreview = useAppStore((state) => state.activatePreview)
  const deactivatePreview = useAppStore((state) => state.deactivatePreview)
  const closePreview = useAppStore((state) => state.closePreview)
  const closeTab = useAppStore((state) => state.closeTab)
  // scrollback 是创建期参数:tab 挂上后即取 store 设置值(只读一次,无设置界面不会变)
  const [scrollback, setScrollback] = useState(FALLBACK_SCROLLBACK)

  // Fix-B:终端首个 fit 收敛即触发 spawn(带真实 cols/rows);消费逻辑在 sessions-slice,
  // 重复回调由 pendingSpawns 一次性消费兜住
  useEffect(() => {
    setTerminalReadyHandler((sessionId, cols, rows) => {
      void useAppStore.getState().spawnOnTerminalReady(sessionId, cols, rows)
    })
    return () => setTerminalReadyHandler(null)
  }, [])

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
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      {(tabs.length > 0 || previewPath !== null) && (
        <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-zinc-200 px-2 py-1 dark:border-zinc-700">
          {tabs.map((tab) => {
            // tab 只挂记录 id:显示名/项目名从持久记录取(重命名后 tab 即时跟随)
            const record = records.find((session) => session.id === tab.sessionId)
            const title = record?.title ?? tab.sessionId
            const active = tab.sessionId === activeTabId
            const projectName = projects.find((p) => p.id === record?.projectId)?.name
            return (
              <div
                key={tab.sessionId}
                className={`flex shrink-0 items-center gap-1.5 rounded px-2 py-1 text-sm ${
                  active
                    ? 'bg-zinc-200 dark:bg-zinc-700'
                    : 'text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800'
                }`}
              >
                <button
                  type="button"
                  className="flex items-center gap-1.5 truncate"
                  onClick={() => {
                    setActiveTab(tab.sessionId)
                    deactivatePreview() // 点终端标签:切回终端画面,预览标签保留在栏上
                  }}
                >
                  <span className="max-w-40 truncate">{title}</span>
                  {projectName && (
                    <span className="max-w-28 truncate text-xs text-zinc-500 dark:text-zinc-400">
                      {projectName}
                    </span>
                  )}
                  {runStates[tab.sessionId] === 'exited' && (
                    <span className="text-xs text-zinc-400 dark:text-zinc-500">
                      {RUN_STATE_DISPLAY.exited.label}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  aria-label={`关闭会话 ${title}`}
                  className="rounded p-0.5 text-zinc-400 hover:bg-zinc-300 hover:text-zinc-700 dark:hover:bg-zinc-600 dark:hover:text-zinc-200"
                  onClick={() => void closeTab(tab.sessionId)}
                >
                  <X className="size-3.5" aria-hidden />
                </button>
              </div>
            )
          })}
          {previewPath !== null && (
            <div
              className={`flex shrink-0 items-center gap-1.5 rounded px-2 py-1 text-sm ${
                previewActive
                  ? 'bg-zinc-200 dark:bg-zinc-700'
                  : 'text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800'
              }`}
            >
              <button
                type="button"
                className="flex items-center gap-1.5 truncate"
                onClick={activatePreview}
              >
                <span className="max-w-40 truncate">{previewName}</span>
              </button>
              <button
                type="button"
                aria-label="关闭文件预览"
                className="rounded p-0.5 text-zinc-400 hover:bg-zinc-300 hover:text-zinc-700 dark:hover:bg-zinc-600 dark:hover:text-zinc-200"
                onClick={closePreview}
              >
                <X className="size-3.5" aria-hidden />
              </button>
            </div>
          )}
        </div>
      )}
      {previewActive && previewPath !== null ? (
        /* 预览占中间区:key = 路径,切换文件重挂读取态归零;T10 起按 previewKind 分流
           (文件只读预览 / 变更文件差异),两者都不往标签载荷塞 root */
        previewKind === 'git-diff' ? (
          <DiffView key={`diff-${previewPath}`} />
        ) : (
          <FilePreview key={previewPath} path={previewPath} />
        )
      ) : tabs.length === 0 ? (
        <EmptyState title="没有打开的会话" hint="从左栏「新建会话」选择一个 agent 开始" />
      ) : (
        tabs.map((tab) => (
          <TerminalView
            key={tab.sessionId}
            sessionId={tab.sessionId}
            active={tab.sessionId === activeTabId}
            scrollback={scrollback}
          />
        ))
      )}
    </div>
  )
}
