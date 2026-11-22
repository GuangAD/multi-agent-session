// agent 品牌徽标(plan:agents-display.tsx——agent 名称与徽标渲染;M7 品牌图标落地)
// 无底色形态:品牌 SVG 直接渲染;固定比例(viewBox 锁死)、大小可调(size 属性,默认 20);
// 颜色按 agent 固定,不随主题翻转;Antigravity 用官方多色图标自带配色,其余为品牌固定色
import type { AgentId } from '../../shared/types'
import { AGENT_ICONS } from './agents-icons'

// 固定前景色;antigravity 为官方多色图标,不注入颜色(undefined = 不设 color)
const AGENT_COLORS: Record<AgentId, string | undefined> = {
  claude: '#d97757',
  codex: '#0284c7',
  antigravity: undefined,
  pi: '#059669',
  kimi: '#1783ff'
}

// 品牌图标按 agentId 取自 agents-icons;definitions 的 icon 字段(首字母时期遗留)不再消费
export function AgentBadge({
  agentId,
  size = 20
}: {
  agentId: AgentId
  size?: number
}): React.JSX.Element {
  const Icon = AGENT_ICONS[agentId]
  return (
    <span aria-hidden className="inline-flex shrink-0" style={{ color: AGENT_COLORS[agentId] }}>
      <Icon size={size} />
    </span>
  )
}
