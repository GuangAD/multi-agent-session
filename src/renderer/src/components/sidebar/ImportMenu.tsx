// 导入菜单(spec:components/sidebar/ImportMenu):项目会话区「导入」→ 选 agent → 扫描该 agent 存储 → 结果提示
// 与「新建会话」的区别:导入不需要该 agent 装在本机——数据来源是 agent 自己的存储目录,
// 也不创建标签页(导入的会话点击行为与「+」新建完全一致,走 ProjectGroup 的 reopenSession)。
import { useEffect, useState } from 'react'
import { ChevronDown, ChevronRight, Download } from 'lucide-react'
import { bridge } from '../../ipc/bridge'
import { AgentBadge } from '../../agents-display'
import { useAppStore } from '../../store/app-store'
import type { AgentListItem } from '../../../../shared/agents'
import type { Project } from '../../../../shared/types'
import { Button } from '../ui/button'

export function ImportMenu({ project }: { project: Project }): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [agents, setAgents] = useState<AgentListItem[]>([])
  const [running, setRunning] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const importSessions = useAppStore((state) => state.importSessions)

  // 首次展开时拉一次清单(与 NewSessionMenu 同源:注册表 + 安装检测都在主进程)
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

  const runImportFor = async (agent: AgentListItem): Promise<void> => {
    setRunning(true)
    setMessage(null)
    try {
      const { imported, skipped } = await importSessions(project.id, agent.def.id)
      const skippedNote = skipped > 0 ? `,跳过 ${skipped} 条(已导入或已删除)` : ''
      setMessage(
        imported > 0
          ? `已导入 ${imported} 条${skippedNote}`
          : // 0 条有两种成因:本机没有该项目的历史会话,或该 agent 的导入支持还没接(T7 补齐其余三家)
            `没有可导入的新会话${skippedNote}(本机没有该 agent 在该项目下的历史会话,或该 agent 尚未支持导入)`
      )
    } catch (error) {
      console.error('导入会话失败:', error)
      setMessage('导入失败,详见控制台')
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="flex flex-col gap-0.5 py-0.5">
      <Button
        variant="ghost"
        aria-expanded={open}
        className="w-full justify-start text-xs"
        onClick={() => setOpen((value) => !value)}
      >
        <Download className="size-3.5" aria-hidden />
        导入历史会话
        {open ? (
          <ChevronDown className="size-3.5" aria-hidden />
        ) : (
          <ChevronRight className="size-3.5" aria-hidden />
        )}
      </Button>
      {open && (
        <ul className="flex flex-col gap-0.5">
          {agents.map((agent) => (
            <li key={agent.def.id}>
              <button
                type="button"
                disabled={running}
                title={`从 ${agent.def.name} 的存储里导入 ${project.name} 的历史会话`}
                className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs hover:bg-zinc-200 disabled:opacity-50 dark:hover:bg-zinc-800"
                onClick={() => void runImportFor(agent)}
              >
                <AgentBadge agentId={agent.def.id} icon={agent.def.icon} />
                <span className="min-w-0 flex-1 truncate">{agent.def.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {message && <p className="px-2 text-xs text-zinc-500 dark:text-zinc-400">{message}</p>}
    </div>
  )
}
