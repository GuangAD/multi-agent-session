// 新建会话菜单:展开渲染 5 个 agent 的名称/首字母徽标/安装状态(未安装置灰并标注「未安装」)
// 选中接线在 T3:本任务点击不做会话创建。
import { useEffect, useState } from 'react'
import { ChevronDown, ChevronRight, SquarePen } from 'lucide-react'
import { bridge } from '../../ipc/bridge'
import { AgentBadge } from '../../agents-display'
import type { AgentListItem } from '../../../../shared/agents'
import { Button } from '../ui/button'

export function NewSessionMenu(): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [agents, setAgents] = useState<AgentListItem[]>([])

  // 首次展开时拉一次清单;安装检测在主进程完成
  useEffect(() => {
    if (open && agents.length === 0) {
      void bridge.agents.list().then(setAgents)
    }
  }, [open, agents.length])

  return (
    <div className="flex flex-col gap-1">
      <Button aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <SquarePen className="size-4" aria-hidden />
        新建会话
        {open ? (
          <ChevronDown className="size-4" aria-hidden />
        ) : (
          <ChevronRight className="size-4" aria-hidden />
        )}
      </Button>
      {open && (
        <ul className="flex flex-col gap-0.5">
          {agents.map(({ def, installed }) => (
            <li key={def.id}>
              <button
                type="button"
                disabled={!installed}
                className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm text-left ${
                  installed
                    ? 'hover:bg-zinc-200 dark:hover:bg-zinc-800'
                    : 'cursor-not-allowed opacity-50'
                }`}
                // T3 接线点:选中 agent 后在项目目录拉起 PTY(T2 只做清单与安装状态渲染)
                onClick={() => {}}
              >
                <AgentBadge agentId={def.id} icon={def.icon} />
                <span className="min-w-0 flex-1 truncate">{def.name}</span>
                {!installed && (
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">未安装</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
