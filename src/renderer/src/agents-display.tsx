// agent 品牌徽标(T2 载荷驱动):icon/color/name 全部由调用方从 store 载荷(def)取来传入,
// 组件不持任何按 id 的映射表。双形态:
//   · icon 非空(完整 SVG 文档字符串,插件包构建期内联)→ data URL 交给 <img>;
//     品牌图标均为固定自配色,不注入颜色;
//   · icon 缺失 → 首字母兜底砖:圆角底 + 名称首字母,已知 agent 用品牌色
//     (底取低透明度、字母取实色),完全未知(全缺省)用中性 zinc 同款。
// 颜色按载荷固定,不随主题翻转(品牌图标定稿口径)。

// SVG 文档 → data URL:内容经 encodeURIComponent(#、% 等字符不转义会被 URL 截断)
function toSvgDataUrl(svg: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

export function AgentBadge({
  icon,
  color,
  name,
  size = 20
}: {
  icon?: string
  color?: string
  name?: string
  size?: number
}): React.JSX.Element {
  if (icon) {
    return (
      <img
        src={toSvgDataUrl(icon)}
        alt=""
        aria-hidden
        width={size}
        height={size}
        className="shrink-0"
      />
    )
  }
  // 兜底砖:字母取名称首字符(无名称则空砖);底色 color-mix 12% 透明度配比属观感,
  // 手动冒烟覆盖(T2 测试规格:不进单测)。未知 agent 全缺省 → 中性 zinc 同款。
  const letter = name?.trim().charAt(0).toUpperCase() ?? ''
  return (
    <span
      aria-hidden
      className={`inline-flex shrink-0 items-center justify-center rounded font-semibold ${
        color ? '' : 'bg-hover text-ink-muted'
      }`}
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.5),
        ...(color ? { backgroundColor: `color-mix(in srgb, ${color} 12%, transparent)`, color } : {})
      }}
    >
      {letter}
    </span>
  )
}
