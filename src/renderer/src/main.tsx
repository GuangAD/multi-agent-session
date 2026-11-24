import './assets/main.css'
import '@xterm/xterm/css/xterm.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { applyAppearance, systemPrefersDark } from './theme'

// 首帧防闪(T11 评审 Minor-6):theme 的真实值要等 settings.get() 回来才知道,
// 先按系统偏好落一次类;强制深色的用户不会先看到一帧白底,随后 ThemeToggle 会按设置纠正。
applyAppearance(systemPrefersDark(), 'default')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
