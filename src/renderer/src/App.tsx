// 布局:窗口标题栏(左栏开关 + 面板入口/面板动作)| 左栏侧栏 | 中间终端区 | 右侧面板(单面板)
// (T1 骨架 → T4 侧栏 → T9 文件 → T10 Git → T10 评审期调整:面板入口与面板动作常驻标题栏,
// 左右栏与面板内部不再各占一行标题,垂直空间全留给内容)
// 主题策略:Tailwind dark: 变体默认跟随系统(prefers-color-scheme),手动切换交互在 T11。
import { useEffect, useState } from 'react'
import {
  ExternalLink,
  Files,
  GitBranch,
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCw
} from 'lucide-react'
import { useAppStore } from './store/app-store'
import { Button } from './components/ui/button'
import { Sidebar } from './components/sidebar/Sidebar'
import { FileTreePanel } from './components/file-panel/FileTreePanel'
import { GitPanel } from './components/git-panel/GitPanel'
import { TerminalTabs } from './components/terminal/TerminalTabs'
import { bridge } from './ipc/bridge'

// 右栏可显示的面板:'files' 文件树 / 'git' Git 面板 / null 收起(默认隐藏)
type RightPanel = 'files' | 'git' | null

function App(): React.JSX.Element {
  const setRunState = useAppStore((state) => state.setRunState)
  const loadProjects = useAppStore((state) => state.loadProjects)
  const loadSessions = useAppStore((state) => state.loadSessions)
  const projects = useAppStore((state) => state.projects)
  const selectedProjectId = useAppStore((state) => state.selectedProjectId)
  const [leftOpen, setLeftOpen] = useState(true)
  const [rightPanel, setRightPanel] = useState<RightPanel>(null)
  // 刷新计数:标题栏的刷新按钮把计数 +1,面板以 `${projectId}:${tick}` 作 key 重挂取新数据
  // Why 用重挂而不是把刷新函数塞进 store:面板的取数与展开态都是组件内部状态,
  // key 变化即天然回到「首次加载」形态,不必在组件之间传回调(与 T9/T10 既有模式一致)
  const [refreshTick, setRefreshTick] = useState(0)

  const activeProject = projects.find((item) => item.id === selectedProjectId) ?? null

  // 启动顺序:先项目,再按项目逐个拉会话记录(sessions:list 载荷是单个 projectId)
  useEffect(() => {
    void (async () => {
      await loadProjects()
      await loadSessions()
    })().catch((error) => {
      console.error('加载项目与会话记录失败:', error)
    })
  }, [loadProjects, loadSessions])

  // 运行状态唯一来源:主进程 state:changed(三源引擎去抖后的判定;PTY 退出也在其中转 exited)
  // Why: 状态点的语义(working/waiting/idle/exited)全部由引擎裁定,渲染层只落地不判断
  useEffect(
    () => bridge.state.onChanged((event) => setRunState(event.sessionId, event.state)),
    [setRunState]
  )

  // 标题栏入口:点同一个再次收起(第二次点击 = 关);点另一个直接切换面板
  const togglePanel = (panel: Exclude<RightPanel, null>): void => {
    setRightPanel((current) => (current === panel ? null : panel))
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden text-zinc-900 dark:text-zinc-100">
      {/* 窗口标题栏:顶栏即系统标题栏,所有全局开关与面板动作都收敛在这里。
          -webkit-app-region: drag 让空白处可拖窗口;按钮各自 no-drag 才可点。
          右侧留出系统最小化/最大化/关闭的 overlay 区域(env 变量由 Electron 注入,
          取不到时退回 140px 估算宽度)。 */}
      <header
        className="flex h-9 shrink-0 items-center gap-1 border-b border-zinc-200 bg-white pl-2 dark:border-zinc-700 dark:bg-zinc-900"
        style={
          {
            WebkitAppRegion: 'drag',
            paddingRight: 'calc(100vw - env(titlebar-area-width, calc(100vw - 140px)))'
          } as React.CSSProperties
        }
      >
        <div
          className="flex items-center gap-1"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          <Button
            variant="ghost"
            aria-label={leftOpen ? '收起左栏' : '展开左栏'}
            className="!px-1.5 !py-1"
            onClick={() => setLeftOpen((open) => !open)}
          >
            {leftOpen ? (
              <PanelLeftClose className="size-4" aria-hidden />
            ) : (
              <PanelLeftOpen className="size-4" aria-hidden />
            )}
          </Button>
          <span className="px-1 text-sm font-semibold">Agent Sessions</span>
        </div>

        <div
          className="ml-auto flex items-center gap-1"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          {/* 面板动作:只在对应面板展开时出现(面板内部不再有自己的标题行) */}
          {rightPanel === 'files' && (
            <>
              <Button
                variant="ghost"
                aria-label="刷新文件树"
                className="!px-1.5 !py-1"
                onClick={() => setRefreshTick((tick) => tick + 1)}
              >
                <RefreshCw className="size-4" aria-hidden />
              </Button>
              <Button
                variant="ghost"
                aria-label="通过 VS Code 打开项目目录"
                className="!px-1.5 !py-1"
                disabled={!activeProject}
                onClick={() => {
                  if (activeProject) {
                    void bridge.files.openInEditor(activeProject.path)
                  }
                }}
              >
                <ExternalLink className="size-4" aria-hidden />
              </Button>
            </>
          )}
          {rightPanel === 'git' && (
            <Button
              variant="ghost"
              aria-label="刷新 Git 状态"
              className="!px-1.5 !py-1"
              onClick={() => setRefreshTick((tick) => tick + 1)}
            >
              <RefreshCw className="size-4" aria-hidden />
            </Button>
          )}

          <Button
            variant="ghost"
            aria-pressed={rightPanel === 'files'}
            className={`!py-1 ${rightPanel === 'files' ? 'bg-zinc-200 dark:bg-zinc-700' : ''}`}
            onClick={() => togglePanel('files')}
          >
            <Files className="size-4" aria-hidden />
            文件
          </Button>
          <Button
            variant="ghost"
            aria-pressed={rightPanel === 'git'}
            className={`!py-1 ${rightPanel === 'git' ? 'bg-zinc-200 dark:bg-zinc-700' : ''}`}
            onClick={() => togglePanel('git')}
          >
            <GitBranch className="size-4" aria-hidden />
            Git
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* 左栏:侧栏(添加目录 / 新建会话 / 项目 + 会话树);开关在标题栏 */}
        {leftOpen && (
          <aside className="flex min-h-0 w-60 shrink-0 flex-col border-r border-zinc-200 p-2 dark:border-zinc-700">
            <Sidebar />
          </aside>
        )}

        {/* 中间:终端区(标签页 + 常驻 xterm;文件/Git 预览也在这里开标签) */}
        <main className="flex min-h-0 min-w-0 flex-1 flex-col bg-zinc-50 dark:bg-zinc-900">
          <TerminalTabs />
        </main>

        {/* 右栏:单面板(文件树 或 Git),切换与刷新都在标题栏;默认隐藏 */}
        {rightPanel && (
          <aside className="flex min-h-0 w-72 shrink-0 flex-col border-l border-zinc-200 dark:border-zinc-700">
            {rightPanel === 'files' ? (
              <FileTreePanel refreshTick={refreshTick} />
            ) : (
              <GitPanel refreshTick={refreshTick} />
            )}
          </aside>
        )}
      </div>
    </div>
  )
}

export default App
