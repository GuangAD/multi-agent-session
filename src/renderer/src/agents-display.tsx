// agent 首字母徽标(plan:agents-display.tsx——agent 名称与徽标渲染;M2 首字母彩色徽标,M7 换品牌图标)
import type { AgentId } from '../../shared/types'

// 徽标底色按 agent id 固定五色(brief 第 8 节授权项:具体色值实施自定;绿/橙语义仅状态点用)
const BADGE_CLASSES: Record<AgentId, string> = {
  claude: 'bg-orange-500/15 text-orange-700 dark:text-orange-400',
  codex: 'bg-sky-500/15 text-sky-700 dark:text-sky-400',
  antigravity: 'bg-violet-500/15 text-violet-700 dark:text-violet-400',
  pi: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  kimi: 'bg-rose-500/15 text-rose-700 dark:text-rose-400'
}

// icon 取定义的「首字母徽标 id」(definitions/*.ts 的 icon 字段),底色按 id 区分同名首字母(claude/codex 同为 C)
export function AgentBadge({
  agentId,
  icon
}: {
  agentId: AgentId
  icon: string
}): React.JSX.Element {
  return (
    <span
      aria-hidden
      className={`flex size-5 shrink-0 items-center justify-center rounded text-xs font-semibold ${BADGE_CLASSES[agentId]}`}
    >
      {icon}
    </span>
  )
}
