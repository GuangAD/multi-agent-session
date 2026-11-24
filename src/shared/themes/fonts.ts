// 终端字体预置:默认回退链为 use-terminal 现状整串原样搬来(含首尾引号写法),字体度量
// 单一来源约定见 docs/issues/2026-11-21-terminal-rendering.md 第七节。
export const DEFAULT_FONT_FALLBACK_CHAIN =
  '"SF Mono", "Menlo", "Monaco", "Cascadia Mono", "Consolas", "DejaVu Sans Mono", "Liberation Mono", "Symbols Nerd Font Mono", "MesloLGS Nerd Font", "JetBrainsMono Nerd Font", "Hack Nerd Font", monospace'

export type FontOption = { label: string; value?: string } // value 缺省 = 默认回退链

// 字体下拉数据(brief 第 5 节拍板清单):首项「默认(回退链)」+ 10 项预置,渲染层直接 map 成 option
export const TERMINAL_FONT_OPTIONS: FontOption[] = [
  { label: '默认(回退链)' },
  { label: 'Cascadia Mono', value: 'Cascadia Mono' },
  { label: 'Consolas', value: 'Consolas' },
  { label: 'Lucida Console', value: 'Lucida Console' },
  { label: 'Cascadia Code', value: 'Cascadia Code' },
  { label: 'JetBrains Mono', value: 'JetBrains Mono' },
  { label: 'Fira Code', value: 'Fira Code' },
  { label: 'Source Code Pro', value: 'Source Code Pro' },
  { label: 'IBM Plex Mono', value: 'IBM Plex Mono' },
  { label: 'Noto Sans Mono', value: 'Noto Sans Mono' },
  { label: '更纱黑体 Sarasa Mono SC', value: 'Sarasa Mono SC' }
]
