// 三栏空壳:左栏项目列表 | 中间终端占位 | 右侧面板占位;左右均可收起(T1)
// 主题策略:Tailwind dark: 变体默认跟随系统(prefers-color-scheme),手动切换交互在 T11。
import { useEffect, useState } from 'react'
import {
  Folder,
  FolderOpen,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Trash2
} from 'lucide-react'
import { useAppStore } from './store/app-store'
import { Button } from './components/ui/button'
import { EmptyState } from './components/ui/empty-state'
import type { Project } from '../../shared/types'

function ProjectList({
  projects,
  onRemove
}: {
  projects: Project[]
  onRemove: (id: string) => void
}): React.JSX.Element {
  if (projects.length === 0) {
    return <EmptyState title="还没有项目" hint="点击上方「添加目录」,选择一个文件夹开始" />
  }
  return (
    <ul className="flex-1 space-y-1 overflow-y-auto">
      {projects.map((project) => (
        <li
          key={project.id}
          className="group flex items-center gap-2 rounded px-2 py-1.5 hover:bg-zinc-200 dark:hover:bg-zinc-800"
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
            onClick={() => onRemove(project.id)}
          >
            <Trash2 className="size-4" aria-hidden />
          </Button>
        </li>
      ))}
    </ul>
  )
}

function App(): React.JSX.Element {
  const projects = useAppStore((state) => state.projects)
  const loadProjects = useAppStore((state) => state.loadProjects)
  const addProject = useAppStore((state) => state.addProject)
  const removeProject = useAppStore((state) => state.removeProject)
  const [leftOpen, setLeftOpen] = useState(true)
  const [rightOpen, setRightOpen] = useState(true)

  useEffect(() => {
    void loadProjects()
  }, [loadProjects])

  return (
    <div className="flex h-screen text-zinc-900 dark:text-zinc-100">
      {/* 左栏:项目列表 */}
      {leftOpen && (
        <aside className="flex w-60 shrink-0 flex-col gap-2 border-r border-zinc-200 p-2 dark:border-zinc-700">
          <div className="flex items-center justify-between">
            <h1 className="px-1 text-sm font-semibold">项目</h1>
            <Button variant="ghost" aria-label="收起左栏" onClick={() => setLeftOpen(false)}>
              <PanelLeftClose className="size-4" aria-hidden />
            </Button>
          </div>
          <Button onClick={() => void addProject()}>
            <FolderOpen className="size-4" aria-hidden />
            添加目录
          </Button>
          <ProjectList projects={projects} onRemove={(id) => void removeProject(id)} />
        </aside>
      )}

      {/* 中间:终端区占位(M2 接入标签页与 xterm) */}
      <main className="relative flex min-w-0 flex-1 flex-col bg-zinc-50 dark:bg-zinc-900">
        <div className="absolute left-2 top-2 z-10 flex gap-1">
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
        <EmptyState title="终端区" hint="会话标签页与 xterm 终端将在后续版本提供" />
      </main>

      {/* 右栏:文件 / Git 面板占位(M5/M6 接入) */}
      {rightOpen && (
        <aside className="flex w-72 shrink-0 flex-col border-l border-zinc-200 dark:border-zinc-700">
          <div className="flex items-center justify-between p-2">
            <h2 className="px-1 text-sm font-semibold">面板</h2>
            <Button variant="ghost" aria-label="收起右栏" onClick={() => setRightOpen(false)}>
              <PanelRightClose className="size-4" aria-hidden />
            </Button>
          </div>
          <EmptyState title="文件 / Git" hint="文件浏览与 Git 面板将在后续版本提供" />
        </aside>
      )}
    </div>
  )
}

export default App
