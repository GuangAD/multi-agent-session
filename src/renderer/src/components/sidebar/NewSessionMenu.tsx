// 新建会话菜单:展开渲染 5 个 agent 的名称/首字母徽标/安装状态(未安装置灰并标注「未安装」)
// T4 接线:选中 agent → sessions:create 入库 → 开 tab → 首个 fit 后 pty:spawn(需先选中一个项目)
import { useEffect, useState } from 'react'
import { ChevronDown, ChevronRight, SquarePen } from 'lucide-react'
import { bridge } from '../../ipc/bridge'
import { AgentBadge } from '../../agents-display'
import { useAppStore } from '../../store/app-store'
import type { AgentListItem } from '../../../../shared/agents'
import { Button } from '../ui/button'

export function NewSessionMenu(): React.JSX.Element {
  // 展开态放 store(T11):Ctrl+N 在 App 的全局按键处理里触发,与菜单本体不在同一分支
  const open = useAppStore((state) => state.newSessionMenuOpen)
  const setOpen = useAppStore((state) => state.setNewSessionMenuOpen)
  const [agents, setAgents] = useState<AgentListItem[]>([])
  const projects = useAppStore((state) => state.projects)
  const selectedProjectId = useAppStore((state) => state.selectedProjectId)
  const openSession = useAppStore((state) => state.openSession)
  const selectedProject = projects.find((project) => project.id === selectedProjectId) ?? null

  // 首次展开时拉一次清单;安装检测在主进程完成
  useEffect(() => {
    if (open && agents.length === 0) {
      void bridge.agents
        .list()
        .then(setAgents)
        .catch((error) => {
          console.error('加载 agent 清单失败:', error)
        })
    }
  }, [open, agents.length])

  const createSession = (agent: AgentListItem): void => {
    if (!selectedProject) {
      return // 未选项目时不创建(按钮已置灰,防御并发点击)
    }
    setOpen(false)
    void openSession(selectedProject, agent)
  }

  return (
    <div className="flex flex-col gap-1">
      <Button aria-expanded={open} onClick={() => setOpen(!open)}>
        <SquarePen className="size-4" aria-hidden />
        新建会话
        {open ? (
          <ChevronDown className="size-4" aria-hidden />
        ) : (
          <ChevronRight className="size-4" aria-hidden />
        )}
      </Button>
      {open && (
        <>
          {!selectedProject && (
            <p className="px-2 text-xs text-zinc-500 dark:text-zinc-400">
              先在下方点击选择一个项目,再选 agent 新建会话
            </p>
          )}
          <ul className="flex flex-col gap-0.5">
            {agents.map((agent) => {
              const { def, installed } = agent
              const disabled = !installed || !selectedProject
              return (
                <li key={def.id}>
                  <button
                    type="button"
                    disabled={disabled}
                    title={
                      !installed
                        ? '未安装'
                        : !selectedProject
                          ? '先选择一个项目'
                          : `在 ${selectedProject.name} 中新建 ${def.name} 会话`
                    }
                    className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm text-left ${
                      disabled
                        ? 'cursor-not-allowed opacity-50'
                        : 'hover:bg-zinc-200 dark:hover:bg-zinc-800'
                    }`}
                    onClick={() => createSession(agent)}
                  >
                    <AgentBadge agentId={def.id} icon={def.icon} />
                    <span className="min-w-0 flex-1 truncate">{def.name}</span>
                    {!installed && (
                      <span className="text-xs text-zinc-500 dark:text-zinc-400">未安装</span>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </div>
  )
}
