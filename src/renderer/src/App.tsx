// 布局:窗口标题栏(左栏开关 + 面板入口/面板动作)| 左栏侧栏 | 中间终端区 | 右侧面板(单面板)
// (T1 骨架 → T4 侧栏 → T9 文件 → T10 Git → T10 评审期调整:面板入口与面板动作常驻标题栏,
// 左右栏与面板内部不再各占一行标题,垂直空间全留给内容)
// 主题策略:Tailwind dark: 变体走 class 策略(<html class="dark">,见 assets/main.css),
// 三态(系统/浅/深)由 ThemeToggle 写类并持久化(settings:set);本文件不直接碰主题。
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
import { ThemeToggle } from './components/ui/ThemeToggle'
import { Sidebar } from './components/sidebar/Sidebar'
import { FileTreePanel } from './components/file-panel/FileTreePanel'
import { GitPanel } from './components/git-panel/GitPanel'
import { TerminalTabs } from './components/terminal/TerminalTabs'
import { applyTerminalAppearanceToAll } from './components/terminal/use-terminal'
import { useSettings } from './store/settings-slice'
import { systemPrefersDark } from './theme'
import { bridge } from './ipc/bridge'

// 右栏可显示的面板:'files' 文件树 / 'git' Git 面板 / null 收起(默认隐藏)
type RightPanel = 'files' | 'git' | null

function App(): React.JSX.Element {
  const setRunState = useAppStore((state) => state.setRunState)
  const loadProjects = useAppStore((state) => state.loadProjects)
  const loadSessions = useAppStore((state) => state.loadSessions)
  const loadAgents = useAppStore((state) => state.loadAgents)
  const projects = useAppStore((state) => state.projects)
  const selectedProjectId = useAppStore((state) => state.selectedProjectId)
  const tabs = useAppStore((state) => state.tabs)
  const activeTabId = useAppStore((state) => state.activeTabId)
  const setActiveTab = useAppStore((state) => state.setActiveTab)
  const applyExternalUpdate = useAppStore((state) => state.applyExternalUpdate)
  const closeTab = useAppStore((state) => state.closeTab)
  const openAgentDialog = useAppStore((state) => state.openAgentDialog)
  const [leftOpen, setLeftOpen] = useState(true)
  const [rightPanel, setRightPanel] = useState<RightPanel>(null)
  // 刷新计数:标题栏的刷新按钮把计数 +1,面板以 `${projectId}:${tick}` 作 key 重挂取新数据
  // Why 用重挂而不是把刷新函数塞进 store:面板的取数与展开态都是组件内部状态,
  // key 变化即天然回到「首次加载」形态,不必在组件之间传回调(与 T9/T10 既有模式一致)
  const [refreshTick, setRefreshTick] = useState(0)
  // 终端外观(T5):设置或系统深浅任一变化 → 全部已开终端即时应用解析结果。
  // Why 在 App 层而不在终端组件:终端实例是常驻注册表,应用是跨实例动作;
  // 度量类变更后 refit 并走既有 onResize → pty.resize 同步 PTY 网格,本层不重复接网格。
  const settings = useSettings((current) => current)
  const [systemDark, setSystemDark] = useState(() => systemPrefersDark())

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (): void => setSystemDark(media.matches)
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])

  useEffect(() => {
    applyTerminalAppearanceToAll(settings, systemDark)
  }, [settings, systemDark])

  const activeProject = projects.find((item) => item.id === selectedProjectId) ?? null

  // 启动顺序:项目与 agent 载荷并行(agents:list 与项目无关;项目一旦失败不得阻断 agent 装载——
  // 弹窗清单只在启动装一次,顺序 await 会把它连坐跳过),会话记录仍随项目之后
  // (sessions:list 载荷是单个 projectId);loadAgents 自身失败不抛,只保持空列表
  useEffect(() => {
    void (async () => {
      await Promise.all([loadProjects(), loadAgents()])
      await loadSessions()
    })().catch((error) => {
      console.error('加载项目与会话记录失败:', error)
    })
  }, [loadProjects, loadSessions, loadAgents])

  // 运行状态唯一来源:主进程 state:changed(三源引擎去抖后的判定;PTY 退出也在其中转 exited)
  // Why: 状态点的语义(working/waiting/idle/exited)全部由引擎裁定,渲染层只落地不判断
  useEffect(
    () => bridge.state.onChanged((event) => setRunState(event.sessionId, event.state)),
    [setRunState]
  )

  // 主进程回填/标题补捞改写会话记录(externalSessionId/标题)→ 原位落位,侧栏即时跟随。
  // Why 走事件而不是重拉列表:一次广播一条记录,upsert 幂等,无需按项目全量刷新
  useEffect(
    () => bridge.sessions.onChanged((session) => applyExternalUpdate(session)),
    [applyExternalUpdate]
  )

  // 上报「当前前台会话」给主进程(T11 通知判定),切标签/窗口聚焦变化都重报一次。
  // Why 也算窗口聚焦:最小化或切到别的应用时,当前标签页对用户来说已经不可见。
  useEffect(() => {
    const report = (): void => {
      void bridge.sessions
        .setActive(document.hasFocus() ? activeTabId : null)
        .catch((error) => console.error('上报前台会话失败:', error))
    }
    report()
    window.addEventListener('focus', report)
    window.addEventListener('blur', report)
    return () => {
      window.removeEventListener('focus', report)
      window.removeEventListener('blur', report)
    }
  }, [activeTabId])

  // 点等输入通知 → 聚焦该会话的标签页(标签可能已关,此时只聚焦窗口,不硬开新标签)
  useEffect(
    () =>
      bridge.state.onNotifyOpen((event) => {
        if (useAppStore.getState().tabs.some((tab) => tab.sessionId === event.sessionId)) {
          setActiveTab(event.sessionId)
        }
      }),
    [setActiveTab]
  )

  // 标题栏入口:点同一个再次收起(第二次点击 = 关);点另一个直接切换面板
  const togglePanel = (panel: Exclude<RightPanel, null>): void => {
    setRightPanel((current) => (current === panel ? null : panel))
  }

  // 全局快捷键(T11 契约「新建会话、切换标签页」+ 面板开关)。
  // Why 走渲染层 keydown 而不是 globalShortcut:后者是系统级(应用不在前台也会抢键),
  // 这里要的是应用内快捷键。
  // **输入态守卫(T11 评审 Important-1)**:Ctrl+B/E/G/N/W 在 bash/zsh 的 readline 里全是编辑键
  // (B 退一格、E 行尾、N 下一条历史、W 删前一个词),而终端是本应用的常驻焦点区——
  // 不守卫就会「想删一个词,结果杀掉正在跑的 agent」。故:
  //   · 焦点在终端内(xterm 用隐藏 textarea 收键,祖先 .xterm)→ 只放行 Ctrl+Tab 切标签;
  //   · 焦点在普通输入框/文本域/可编辑区 → 一律不拦(让控件自己处理输入);
  //   · 其余界面区域 → 按下面处理。
  useEffect(() => {
    const isTerminalTarget = (target: EventTarget | null): boolean =>
      target instanceof Element && target.closest('.xterm') !== null

    const isEditableTarget = (target: EventTarget | null): boolean =>
      target instanceof Element &&
      target.closest('input, textarea, [contenteditable="true"]') !== null

    const onKeyDown = (event: KeyboardEvent): void => {
      // 不带修饰键 / 长按重复:不处理(长按 Ctrl+W 不得连杀多个 PTY)
      if (!(event.ctrlKey || event.metaKey) || event.repeat) {
        return
      }
      const inTerminal = isTerminalTarget(event.target)
      const isTabSwitch = event.key === 'Tab'
      // 输入控件内一律放行原始输入;唯一例外是终端里的 Ctrl+Tab(切标签是应用级动作,
      // shell/TUI 不占这个组合)
      if (isEditableTarget(event.target) && !(inTerminal && isTabSwitch)) {
        return
      }

      if (isTabSwitch) {
        event.preventDefault()
        if (tabs.length === 0) {
          return
        }
        const index = tabs.findIndex((tab) => tab.sessionId === activeTabId)
        const step = event.shiftKey ? -1 : 1
        const next = tabs[(index + step + tabs.length) % tabs.length]
        if (next) {
          setActiveTab(next.sessionId)
        }
        return
      }

      // 终端内其余组合一律不拦:它们是 shell 的行编辑键,拦了就是抢用户输入
      if (inTerminal) {
        return
      }

      const key = event.key.toLowerCase()
      // Ctrl+N:展开左栏并打开「新建会话」弹窗(目标 = 选中项目;无选中项目只展开左栏,不开弹窗)
      if (key === 'n' && !event.shiftKey) {
        event.preventDefault()
        setLeftOpen(true)
        if (activeProject) {
          openAgentDialog({ mode: 'new', projectId: activeProject.id })
        }
        return
      }
      // Ctrl+B:收起/展开左栏
      if (key === 'b' && !event.shiftKey) {
        event.preventDefault()
        setLeftOpen((open) => !open)
        return
      }
      // Ctrl+Shift+E:打开/收起文件面板;Ctrl+Shift+G:打开/收起 Git 面板
      if (key === 'e' && event.shiftKey) {
        event.preventDefault()
        togglePanel('files')
        return
      }
      if (key === 'g' && event.shiftKey) {
        event.preventDefault()
        togglePanel('git')
        return
      }
      // Ctrl+W:关闭当前标签页(会杀 PTY,故终端内被上面的守卫挡住)
      if (key === 'w' && !event.shiftKey && activeTabId) {
        event.preventDefault()
        void closeTab(activeTabId)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [tabs, activeTabId, setActiveTab, closeTab, openAgentDialog, activeProject])

  return (
    <div className="flex h-screen flex-col overflow-hidden text-ink">
      {/* 窗口标题栏:顶栏即系统标题栏,所有全局开关与面板动作都收敛在这里。
          -webkit-app-region: drag 让空白处可拖窗口;按钮各自 no-drag 才可点。
          右侧留出系统最小化/最大化/关闭的 overlay 区域(env 变量由 Electron 注入,
          取不到时退回 140px 估算宽度)。 */}
      <header
        className="flex h-9 shrink-0 items-center gap-1 border-b border-line bg-base pl-2"
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
          <span className="px-1 text-sm font-semibold">Soloport</span>
        </div>

        <div
          className="ml-auto flex items-center gap-1"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          <ThemeToggle />
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
            className={`!py-1 ${rightPanel === 'files' ? 'bg-hover' : ''}`}
            onClick={() => togglePanel('files')}
          >
            <Files className="size-4" aria-hidden />
            文件
          </Button>
          <Button
            variant="ghost"
            aria-pressed={rightPanel === 'git'}
            className={`!py-1 ${rightPanel === 'git' ? 'bg-hover' : ''}`}
            onClick={() => togglePanel('git')}
          >
            <GitBranch className="size-4" aria-hidden />
            Git
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* 左栏:侧栏(添加目录 / 项目 + 会话树;新建/导入的 agent 选择弹窗也挂在侧栏);开关在标题栏 */}
        {leftOpen && (
          <aside className="flex min-h-0 w-60 shrink-0 flex-col border-r border-line p-2">
            <Sidebar />
          </aside>
        )}

        {/* 中间:终端区(标签页 + 常驻 xterm;文件/Git 预览也在这里开标签) */}
        <main className="flex min-h-0 min-w-0 flex-1 flex-col bg-base">
          <TerminalTabs />
        </main>

        {/* 右栏:单面板(文件树 或 Git),切换与刷新都在标题栏;默认隐藏 */}
        {rightPanel && (
          <aside className="flex min-h-0 w-72 shrink-0 flex-col border-l border-line">
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
