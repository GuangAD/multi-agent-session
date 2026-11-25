// 终端区:标签页栏 + 每会话一个常驻 TerminalView(tab 切换仅切可见性)
// scrollback 订阅 settings 切片:设置对话框改行数即让 TerminalView 的既有 effect 重建实例
import { useEffect } from 'react'
import { X } from 'lucide-react'
import { useAppStore } from '../../store/app-store'
import { useSettings } from '../../store/settings-slice'
import { EmptyState } from '../ui/empty-state'
import { TerminalView } from './TerminalView'
import { setTerminalReadyHandler } from './use-terminal'
import { RUN_STATE_DISPLAY } from '../../run-state-display'
import { FilePreview } from '../file-panel/FilePreview'
import { DiffView } from '../git-panel/DiffView'

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
  // scrollback 是创建期参数(T6):订阅 settings 切片而不是挂载时读一次——设置对话框改行数后
  // 值变化即让 TerminalView 的既有 effect 重建实例(契约「回滚行数按重建语义生效」)
  const scrollback = useSettings((settings) => settings.scrollbackRows)

  // Fix-B:终端首个 fit 收敛即触发 spawn(带真实 cols/rows);消费逻辑在 sessions-slice,
  // 重复回调由 pendingSpawns 一次性消费兜住
  useEffect(() => {
    setTerminalReadyHandler((sessionId, cols, rows) => {
      void useAppStore.getState().spawnOnTerminalReady(sessionId, cols, rows)
    })
    return () => setTerminalReadyHandler(null)
  }, [])

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      {(tabs.length > 0 || previewPath !== null) && (
        <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-line px-2 py-1">
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
                    ? 'bg-hover'
                    : 'text-ink-muted hover:bg-hover'
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
                    <span className="max-w-28 truncate text-xs text-ink-muted">
                      {projectName}
                    </span>
                  )}
                  {runStates[tab.sessionId] === 'exited' && (
                    <span className="text-xs text-ink-muted">
                      {RUN_STATE_DISPLAY.exited.label}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  aria-label={`关闭会话 ${title}`}
                  className="rounded p-0.5 text-ink-muted hover:bg-hover hover:text-ink"
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
                  ? 'bg-hover'
                  : 'text-ink-muted hover:bg-hover'
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
                className="rounded p-0.5 text-ink-muted hover:bg-hover hover:text-ink"
                onClick={closePreview}
              >
                <X className="size-3.5" aria-hidden />
              </button>
            </div>
          )}
        </div>
      )}
      {/* 终端组常驻(T7):移出预览条件分支始终渲染——预览激活不卸载实例,scrollback 与
          TTY 状态全程保留;视觉互斥由 active 收窄(标签激活且预览未激活)后 TerminalView
          自身的 display:none 整组实现,关闭预览恢复激活走既有 activateTerminal */}
      {tabs.map((tab) => (
        <TerminalView
          key={tab.sessionId}
          sessionId={tab.sessionId}
          active={tab.sessionId === activeTabId && !previewActive}
          scrollback={scrollback}
        />
      ))}
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
      ) : null}
    </div>
  )
}
