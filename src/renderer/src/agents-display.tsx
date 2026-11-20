// 占位:agent 名称与徽标渲染(plan B2 清单;M2 首字母徽标,M7 换品牌图标)
// T2 落地 AgentDefinition 后替换为按定义渲染的实现。
export function AgentDisplay({ label }: { label: string }): React.JSX.Element {
  return <span className="text-xs">{label}</span>
}
