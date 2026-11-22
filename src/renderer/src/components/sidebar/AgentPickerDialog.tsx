// agent 选择弹窗(T1):新建会话与导入历史会话共用,模式与目标项目来自 ui-slice 的弹窗描述。
// 开关/模式/目标项目全部读 store(Ctrl+N 在 App 全局按键处理里触发,与弹窗不在同一组件分支;
// 目标项目显式记在描述里,不依赖侧栏选中态)。agent 清单读 store 的 agents 载荷(T2:App 启动
// 已装载,弹窗不再自己拉);骨架复用 ConfirmDialog 的遮罩风格;Esc 关闭用弹窗自身监听,不经 App 快捷键处理。
import { useEffect, useState } from 'react'
import { AgentBadge } from '../../agents-display'
import { useAppStore } from '../../store/app-store'
import type { AgentListItem } from '../../../../shared/agents'
import type { Project } from '../../../../shared/types'
import type { AgentDialogDescription } from '../../store/ui-slice'

// 无 props 的挂载入口:描述为 null(未开)或目标项目查不到(弹窗开着时被移除)→ 渲染 null。
// Why 内层拆出 AgentPickerPanel:关闭即卸载语义——弹窗一关内层组件真的卸载,
// 导入消息不跨开合保留(agent 清单在 store,常驻);再次打开无残留消息,无需手工复位状态。
export function AgentPickerDialog(): React.JSX.Element | null {
  const agentDialog = useAppStore((state) => state.agentDialog)
  const projects = useAppStore((state) => state.projects)
  if (!agentDialog) {
    return null
  }
  const project = projects.find((item) => item.id === agentDialog.projectId) ?? null
  if (!project) {
    return null
  }
  // key 按描述整体取值:openAgentDialog 是整体覆盖,换个模式/项目即全新弹窗(无残留导入消息)
  return (
    <AgentPickerPanel
      key={`${agentDialog.mode}:${agentDialog.projectId}`}
      mode={agentDialog.mode}
      project={project}
    />
  )
}

function AgentPickerPanel({
  mode,
  project
}: {
  mode: AgentDialogDescription['mode']
  project: Project
}): React.JSX.Element {
  const closeAgentDialog = useAppStore((state) => state.closeAgentDialog)
  const openSession = useAppStore((state) => state.openSession)
  const importSessions = useAppStore((state) => state.importSessions)
  // agent 清单来自 store 载荷(T2:App 启动 loadAgents 装载,弹窗不自己拉)
  const agents = useAppStore((state) => state.agents)
  const [running, setRunning] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  // Esc 关闭(导入运行中除外);弹窗自身监听,App 快捷键处理只拦带修饰键的组合,互不干扰
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !running) {
        closeAgentDialog()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [running, closeAgentDialog])

  // 点遮罩关闭;导入运行中忽略(防误触中断观感),完成出消息后才允许关
  const requestClose = (): void => {
    if (running) {
      return
    }
    closeAgentDialog()
  }

  // 新建:先关弹窗再走 sessions-slice 既有链路(入库 + 开标签页 + fit 后 spawn)
  const startNewSession = (agent: AgentListItem): void => {
    closeAgentDialog()
    void openSession(project, agent)
  }

  // 导入:只读 agent 存储,不建标签页;结果消息留在弹窗内,弹窗不自动关
  const runImport = async (agent: AgentListItem): Promise<void> => {
    setRunning(true)
    setMessage(null)
    try {
      const { imported, skipped } = await importSessions(project.id, agent.def.id)
      const skippedNote = skipped > 0 ? `,跳过 ${skipped} 条(已导入或已删除)` : ''
      setMessage(
        imported > 0
          ? `已导入 ${imported} 条${skippedNote}`
          : // 0 条的两种成因(口径承自已删除的 ImportMenu):无历史会话,或该 agent 的导入支持未接
            `没有可导入的新会话${skippedNote}(本机没有该 agent 在该项目下的历史会话,或该 agent 尚未支持导入)`
      )
    } catch (error) {
      console.error('导入会话失败:', error)
      setMessage('导入失败,详见控制台')
    } finally {
      setRunning(false)
    }
  }

  const title = mode === 'new' ? '新建会话' : '导入历史会话'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={requestClose}
    >
      <div
        className="w-full max-w-sm rounded-lg bg-white p-4 shadow-lg dark:bg-zinc-800"
        onClick={(event) => event.stopPropagation()}
      >
        <h3 className="text-sm font-semibold">{title}</h3>
        <ul className="mt-2 flex flex-col gap-0.5">
          {agents.map((agent) => {
            const { def, installed } = agent
            // 置灰规则按模式区分:new 看安装状态(未装拉不起 CLI);import 只读 agent 存储,不看安装,
            // 运行中统一禁用条目
            const disabled = mode === 'new' ? !installed : running
            return (
              <li key={def.id}>
                <button
                  type="button"
                  disabled={disabled}
                  title={
                    mode === 'new'
                      ? !installed
                        ? '未安装'
                        : `在 ${project.name} 中新建 ${def.name} 会话`
                      : `从 ${def.name} 的存储里导入 ${project.name} 的历史会话`
                  }
                  className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm text-left ${
                    disabled
                      ? 'cursor-not-allowed opacity-50'
                      : 'hover:bg-zinc-200 dark:hover:bg-zinc-800'
                  }`}
                  onClick={
                    mode === 'new' ? () => startNewSession(agent) : () => void runImport(agent)
                  }
                >
                  <AgentBadge icon={def.icon} color={def.color} name={def.name} />
                  <span className="min-w-0 flex-1 truncate">{def.name}</span>
                  {mode === 'new' && !installed && (
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">未安装</span>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
        {message && <p className="mt-2 px-1 text-xs text-zinc-500 dark:text-zinc-400">{message}</p>}
      </div>
    </div>
  )
}
