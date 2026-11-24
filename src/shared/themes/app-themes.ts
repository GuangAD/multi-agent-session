// 界面主题目录(T4,spec 数据结构节):8 套语义 token 值集,每套自带深、浅两形态。
// default 套 = T1 theme-tokens.css 的 :root/.dark 基准值(zinc 默认灰,default 不挂主题类);
// 其余七套色值出自 T4 契约「数据结构」色值表(色系方向用户已拍板)。
// 只读数据:id 必须与 AppThemeId 联合类型一致;theme-tokens.css 的 .theme-<id> 变量覆盖与这里同源照抄。
export type AppThemeId =
  'default' | 'warm' | 'cool' | 'forest' | 'purple-night' | 'rose' | 'dusk' | 'ember'

// 界面语义 token 值(与 theme-tokens.css 的 --app-* 变量一一对应),色值一律 #rrggbb
export type AppTokenValues = {
  base: string // 窗口底(内容区)
  panel: string // 侧栏/面板容器底:在 base 上做微妙偏移,与内容区分层(浅色略暗、深色略亮)
  surface: string // 面板/浮层
  line: string // 边框
  ink: string // 主文本
  inkMuted: string // 次文本
  accent: string // 强调底(主按钮)
  onAccent: string // 强调底上的文本
  hover: string // 中性悬停叠加
  accentHover: string // 强调底悬停色
}

export type AppTheme = {
  id: AppThemeId
  name: string
  light: AppTokenValues
  dark: AppTokenValues
}

export const APP_THEMES: AppTheme[] = [
  {
    id: 'default',
    name: '默认',
    light: {
      base: '#ffffff',
      panel: '#f4f4f5',
      surface: '#ffffff',
      line: '#e4e4e7',
      ink: '#18181b',
      inkMuted: '#52525b',
      accent: '#18181b',
      onAccent: '#fafafa',
      hover: '#e4e4e7',
      accentHover: '#3f3f46'
    },
    dark: {
      base: '#18181b',
      panel: '#1f1f23',
      surface: '#27272a',
      line: '#3f3f46',
      ink: '#f4f4f5',
      inkMuted: '#d4d4d8',
      accent: '#f4f4f5',
      onAccent: '#18181b',
      hover: '#27272a',
      accentHover: '#d4d4d8'
    }
  },
  {
    id: 'warm',
    name: '暖米',
    light: {
      base: '#faf6f0',
      panel: '#f2ece3',
      surface: '#ffffff',
      line: '#e7ded2',
      ink: '#44403c',
      inkMuted: '#78716c',
      accent: '#b45309',
      onAccent: '#fffbf5',
      hover: '#efe6da',
      accentHover: '#92400e'
    },
    dark: {
      base: '#292524',
      panel: '#322d29',
      surface: '#33302c',
      line: '#44403c',
      ink: '#e7e5e4',
      inkMuted: '#a8a29e',
      accent: '#d97706',
      onAccent: '#1c1917',
      hover: '#3f3a36',
      accentHover: '#f59e0b'
    }
  },
  {
    id: 'cool',
    name: '冷蓝',
    light: {
      base: '#f8fafc',
      panel: '#eef2f7',
      surface: '#ffffff',
      line: '#dbe3ee',
      ink: '#0f172a',
      inkMuted: '#64748b',
      accent: '#1d4ed8',
      onAccent: '#f8faff',
      hover: '#e2e8f0',
      accentHover: '#1e40af'
    },
    dark: {
      base: '#0f172a',
      panel: '#172033',
      surface: '#1e293b',
      line: '#334155',
      ink: '#e2e8f0',
      inkMuted: '#94a3b8',
      accent: '#3b82f6',
      onAccent: '#0b1120',
      hover: '#26334d',
      accentHover: '#60a5fa'
    }
  },
  {
    id: 'forest',
    name: '森绿',
    light: {
      base: '#f6f8f4',
      panel: '#edf0ea',
      surface: '#ffffff',
      line: '#dde5da',
      ink: '#1f2a20',
      inkMuted: '#5c6b5e',
      accent: '#3f6212',
      onAccent: '#f8fcf5',
      hover: '#e3eae0',
      accentHover: '#365314'
    },
    dark: {
      base: '#1c241b',
      panel: '#232c21',
      surface: '#26301f',
      line: '#3a4634',
      ink: '#e6eadf',
      inkMuted: '#a3b18a',
      accent: '#84cc16',
      onAccent: '#16200f',
      hover: '#31402a',
      accentHover: '#a3e635'
    }
  },
  {
    id: 'purple-night',
    name: '紫夜',
    light: {
      base: '#f8f7fc',
      panel: '#f0eef7',
      surface: '#ffffff',
      line: '#e4e0ee',
      ink: '#231d33',
      inkMuted: '#6b6486',
      accent: '#6d28d9',
      onAccent: '#faf9ff',
      hover: '#e9e5f4',
      accentHover: '#5b21b6'
    },
    dark: {
      base: '#1e1b2e',
      panel: '#262238',
      surface: '#2a2540',
      line: '#3d3659',
      ink: '#e6e2f5',
      inkMuted: '#9d94c4',
      accent: '#8b5cf6',
      onAccent: '#141126',
      hover: '#332c4e',
      accentHover: '#a78bfa'
    }
  },
  {
    id: 'rose',
    name: '玫瑰',
    light: {
      base: '#faf7f8',
      panel: '#f3ebee',
      surface: '#ffffff',
      line: '#ecdfe3',
      ink: '#2b2226',
      inkMuted: '#7c6b71',
      accent: '#be185d',
      onAccent: '#fdf6f9',
      hover: '#f1e4e9',
      accentHover: '#9d174d'
    },
    dark: {
      base: '#261c20',
      panel: '#2f2226',
      surface: '#322529',
      line: '#46343a',
      ink: '#f2e8ec',
      inkMuted: '#b39aa3',
      accent: '#ec4899',
      onAccent: '#1b1417',
      hover: '#3d2c32',
      accentHover: '#f472b6'
    }
  },
  {
    id: 'dusk',
    name: '暮蓝',
    light: {
      base: '#f7f8fb',
      panel: '#eef0f6',
      surface: '#ffffff',
      line: '#dfe3ef',
      ink: '#171c2e',
      inkMuted: '#5d657e',
      accent: '#4338ca',
      onAccent: '#f8f9ff',
      hover: '#e4e8f4',
      accentHover: '#3730a3'
    },
    dark: {
      base: '#191d2f',
      panel: '#212639',
      surface: '#232946',
      line: '#363d63',
      ink: '#e4e7f7',
      inkMuted: '#9aa1c4',
      accent: '#6366f1',
      onAccent: '#12152a',
      hover: '#2d3355',
      accentHover: '#818cf8'
    }
  },
  {
    id: 'ember',
    name: '暖橙',
    light: {
      base: '#fbf7f4',
      panel: '#f4ede7',
      surface: '#ffffff',
      line: '#ecdfd6',
      ink: '#2e211b',
      inkMuted: '#7d6a5f',
      accent: '#c2410c',
      onAccent: '#fffaf6',
      hover: '#f2e5dc',
      accentHover: '#9a3412'
    },
    dark: {
      base: '#271d17',
      panel: '#31241d',
      surface: '#342620',
      line: '#48352b',
      ink: '#f2e8e2',
      inkMuted: '#b39d90',
      accent: '#ea580c',
      onAccent: '#1c130e',
      hover: '#3f2d24',
      accentHover: '#fb923c'
    }
  }
]
