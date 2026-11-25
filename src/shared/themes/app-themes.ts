// 界面主题目录(第二版,J-005):每套一组 token + isDark,不再有深浅两形态。
// 色值来自主题调研与定选(docs/plans/2026-11-24-theme-style-settings/theme-selection-tokens.json,
// 由 gen-theme-data.py 生成,勿手改本文件);VS Code / GitHub 取规范化主题 JSON 官方值,
// Carbonfox / Selenized White 取各自官方色值,Tango / Gruvbox 取本仓库 catalog(仅 Gruvbox 换 hard 档背景)。
// 三处用户指定的主色覆盖已固化:github-dark 与 github-dark-hc 用 #0078d4,github-light 与
// gruvbox-light-hard 用 #000000。
export type AppThemeId =
  | 'github-dark'
  | 'github-dark-hc'
  | 'vscode-dark-modern'
  | 'carbonfox'
  | 'tango-dark'
  | 'vscode-light'
  | 'github-light'
  | 'gruvbox-light-hard'
  | 'selenized-white'
  | 'tango-light'
  | 'flexoki-light'
  | 'tomorrow'

// 界面语义 token 值(与 theme-tokens.css 的 --app-* 变量一一对应),色值一律 #rrggbb
export type AppTokenValues = {
  base: string // 内容区底
  panel: string // 侧栏与面板容器底(在 base 上做微妙偏移,与内容区分层)
  surface: string // 浮层(对话框/菜单/预览)
  line: string // 边框
  ink: string // 主文本
  inkMuted: string // 次文本
  accent: string // 强调底(主按钮)
  onAccent: string // 强调底上的文本
  hover: string // 中性悬停叠加
  accentHover: string // 强调底悬停色
}

// isDark 只用于 color-scheme 与主进程原生控件着色,不参与主题选择
export type AppTheme = { id: AppThemeId; name: string; isDark: boolean; tokens: AppTokenValues }

export const APP_THEMES: AppTheme[] = [
  {
    id: 'github-dark',
    name: 'GitHub Dark',
    isDark: true,
    tokens: {
      base: '#0d1117',
      panel: '#010409',
      surface: '#010409',
      line: '#30363d',
      ink: '#e6edf3',
      inkMuted: '#7d8590',
      accent: '#0078d4',
      onAccent: '#ffffff',
      hover: '#282e33',
      accentHover: '#298dda',
    }
  },
  {
    id: 'github-dark-hc',
    name: 'GitHub Dark 高对比',
    isDark: true,
    tokens: {
      base: '#0a0c10',
      panel: '#010409',
      surface: '#010409',
      line: '#7a828e',
      ink: '#f0f3f6',
      inkMuted: '#f0f3f6',
      accent: '#0078d4',
      onAccent: '#ffffff',
      hover: '#4c525d',
      accentHover: '#2b8eda',
    }
  },
  {
    id: 'vscode-dark-modern',
    name: 'VS Code Dark Modern',
    isDark: true,
    tokens: {
      base: '#1f1f1f',
      panel: '#181818',
      surface: '#181818',
      line: '#2b2b2b',
      ink: '#cccccc',
      inkMuted: '#9d9d9d',
      accent: '#0078d4',
      onAccent: '#ffffff',
      hover: '#1f1f1f',
      accentHover: '#2587d3',
    }
  },
  {
    id: 'carbonfox',
    name: 'Carbonfox',
    isDark: true,
    tokens: {
      base: '#161616',
      panel: '#222222',
      surface: '#2c2c2d',
      line: '#424243',
      ink: '#f2f4f8',
      inkMuted: '#b6b8bb',
      accent: '#33b1ff',
      onAccent: '#101014',
      hover: '#2f3030',
      accentHover: '#55bdfe',
    }
  },
  {
    id: 'tango-dark',
    name: 'Tango Dark',
    isDark: true,
    tokens: {
      base: '#000000',
      panel: '#0c0c0b',
      surface: '#151615',
      line: '#2a2b29',
      ink: '#d3d7cf',
      inkMuted: '#555753',
      accent: '#3465a4',
      onAccent: '#ffffff',
      hover: '#181918',
      accentHover: '#517aac',
    }
  },
  {
    id: 'vscode-light',
    name: 'VS Code Light+',
    isDark: false,
    tokens: {
      base: '#ffffff',
      panel: '#f4f4f4',
      surface: '#e8e8e8',
      line: '#d4d4d4',
      ink: '#000000',
      inkMuted: '#737373',
      accent: '#000000',
      onAccent: '#ffffff',
      hover: '#e6e6e6',
      accentHover: '#2e2e2e',
    }
  },
  {
    id: 'github-light',
    name: 'GitHub Light',
    isDark: false,
    tokens: {
      base: '#ffffff',
      panel: '#f6f8fa',
      surface: '#f6f8fa',
      line: '#d0d7de',
      ink: '#1f2328',
      inkMuted: '#656d76',
      accent: '#000000',
      onAccent: '#ffffff',
      hover: '#ebecf0',
      accentHover: '#2e2e2e',
    }
  },
  {
    id: 'gruvbox-light-hard',
    name: 'Gruvbox Light 高对比',
    isDark: false,
    tokens: {
      base: '#f9f5d7',
      panel: '#f0ecd0',
      surface: '#e8e4c9',
      line: '#d7d3ba',
      ink: '#3c3836',
      inkMuted: '#928374',
      accent: '#000000',
      onAccent: '#ffffff',
      hover: '#e6e2c7',
      accentHover: '#2d2c27',
    }
  },
  {
    id: 'selenized-white',
    name: 'Selenized White',
    isDark: false,
    tokens: {
      base: '#ffffff',
      panel: '#ebebeb',
      surface: '#ececec',
      line: '#cdcdcd',
      ink: '#282828',
      inkMuted: '#878787',
      accent: '#0064e4',
      onAccent: '#ffffff',
      hover: '#eaeaea',
      accentHover: '#2e80e9',
    }
  },
  {
    id: 'tango-light',
    name: 'Tango Light',
    isDark: false,
    tokens: {
      base: '#ffffff',
      panel: '#f6f6f6',
      surface: '#eceded',
      line: '#d9dada',
      ink: '#2e3434',
      inkMuted: '#555753',
      accent: '#3465a4',
      onAccent: '#ffffff',
      hover: '#eaebeb',
      accentHover: '#5981b4',
    }
  },
  {
    id: 'flexoki-light',
    name: 'Flexoki Light',
    isDark: false,
    tokens: {
      base: '#fffcf0',
      panel: '#f2f0e5',
      surface: '#e6e4d9',
      line: '#dad8ce',
      ink: '#100f0f',
      inkMuted: '#6f6e69',
      accent: '#205ea6',
      onAccent: '#ffffff',
      hover: '#e7e4da',
      accentHover: '#487ab3',
    }
  },
  {
    id: 'tomorrow',
    name: 'Tomorrow',
    isDark: false,
    tokens: {
      base: '#ffffff',
      panel: '#f7f7f7',
      surface: '#efefef',
      line: '#dfdfdf',
      ink: '#4d4d4c',
      inkMuted: '#8e908c',
      accent: '#4271ae',
      onAccent: '#ffffff',
      hover: '#ededed',
      accentHover: '#648bbd',
    }
  },
]

// 默认主题(首次启动 / 设置缺失):github-dark
export const DEFAULT_APP_THEME_ID: AppThemeId = 'github-dark'
