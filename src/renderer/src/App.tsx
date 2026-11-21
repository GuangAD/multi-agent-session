// 三栏布局:左栏侧栏(项目/会话树)| 中间终端区 | 右侧面板占位;左右均可收起(T1 骨架,T4 接侧栏)
// 主题策略:Tailwind dark: 变体默认跟随系统(prefers-color-scheme),手动切换交互在 T11。
import { useEffect, useState } from 'react'
import { PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen } from 'lucide-react'
import { useAppStore } from './store/app-store'
import { Button } from './components/ui/button'
import { Sidebar } from './components/sidebar/Sidebar'
import { FileTreePanel } from './components/file-panel/FileTreePanel'
import { TerminalTabs } from './components/terminal/TerminalTabs'
import { bridge } from './ipc/bridge'

function App(): React.JSX.Element {
  const setRunState = useAppStore((state) => state.setRunState)
  const loadProjects = useAppStore((state) => state.loadProjects)
  const loadSessions = useAppStore((state) => state.loadSessions)
  const [leftOpen, setLeftOpen] = useState(true)
  const [rightOpen, setRightOpen] = useState(true)

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

  return (
    <div className="flex h-screen overflow-hidden text-zinc-900 dark:text-zinc-100">
      {/* 左栏:侧栏(添加目录 / 新建会话 / 项目 + 会话树) */}
      {leftOpen && (
        <aside className="flex min-h-0 w-60 shrink-0 flex-col gap-2 border-r border-zinc-200 p-2 dark:border-zinc-700">
          <div className="flex items-center justify-between">
            <h1 className="px-1 text-sm font-semibold">项目</h1>
            <Button variant="ghost" aria-label="收起左栏" onClick={() => setLeftOpen(false)}>
              <PanelLeftClose className="size-4" aria-hidden />
            </Button>
          </div>
          <Sidebar />
        </aside>
      )}

      {/* 中间:终端区(标签页 + 常驻 xterm) */}
      <main className="flex min-h-0 min-w-0 flex-1 flex-col bg-zinc-50 dark:bg-zinc-900">
        {(!leftOpen || !rightOpen) && (
          <div className="flex shrink-0 items-center gap-1 px-2 pt-2">
            {!leftOpen && (
              <Button variant="ghost" aria-label="展开左栏" onClick={() => setLeftOpen(true)}>
                <PanelLeftOpen className="size-4" aria-hidden />
              </Button>
            )}
            {!rightOpen && (
              <Button variant="ghost" aria-label="展开右栏" onClick={() => setRightOpen(true)}>
                <PanelRightOpen className="size-4" aria-hidden />
              </Button>
            )}
          </div>
        )}
        <TerminalTabs />
      </main>

      {/* 右栏:文件面板(T9),Git 面板后续任务接入;收起能力沿用 T1 布局 */}
      {rightOpen && (
        <aside className="flex min-h-0 w-72 shrink-0 flex-col border-l border-zinc-200 dark:border-zinc-700">
          <div className="flex items-center justify-between p-2">
            <h2 className="px-1 text-sm font-semibold">面板</h2>
            <Button variant="ghost" aria-label="收起右栏" onClick={() => setRightOpen(false)}>
              <PanelRightClose className="size-4" aria-hidden />
            </Button>
          </div>
          <FileTreePanel />
        </aside>
      )}
    </div>
  )
}

export default App
