import './assets/main.css'
import '@xterm/xterm/css/xterm.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { DEFAULT_APP_THEME_ID } from '../../shared/themes/app-themes'
import { getAppTheme } from '../../shared/themes/resolve'
import { applyAppearance } from './theme'

// 首帧防闪(T11 评审 Minor-6 引入):真实主题要等 settings.get() 回来才知道,先按默认主题落一次类。
// 第二版不跟随系统(ADR-0009),所以不再读 matchMedia;设置回来后由 App 层 effect 用真实主题纠正。
applyAppearance(getAppTheme({ appTheme: DEFAULT_APP_THEME_ID }))

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
