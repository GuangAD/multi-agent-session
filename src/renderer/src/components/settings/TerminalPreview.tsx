// 终端样式预览块(T7):外观区顶部的迷你终端,如实反映终端主题与字体改动。
// Why 用真实 xterm 而不是静态色块:预览的意义是与真实终端「同一套解析输出」——静态模拟
// 早晚与终端观感分叉(失败形态「预览骗人」)。本实例不接 PTY、disableStdin,也不进
// use-terminal 的 terminals 注册表(否则 applyTerminalAppearanceToAll 会误改预览)。
import { useEffect, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { Moon, Sun } from 'lucide-react'
import { resolveTerminalAppearance } from '../../../../shared/themes/resolve'
import { resolveDark, systemPrefersDark } from '../../theme'
import { Button } from '../ui/button'
import { PREVIEW_BUFFER } from './terminal-preview-content'
import type { Settings } from '../../../../shared/types'

// 与移植文本的排版宽度匹配:36 列 × 15 行,大了会把对话框撑开,小了会折行
const PREVIEW_COLS = 36
const PREVIEW_ROWS = 15

export function TerminalPreview({ settings }: { settings: Settings }): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const terminalRef = useRef<Terminal | null>(null)
  // 预览深浅只切自己,不动主题三态、不落盘(验收条目 6)。
  // 初值必须是「当前解析出的深浅」,否则 theme=system + 系统浅色时预览初态是深色、真实终端是浅色
  // ——两副面孔即 brief 的失败形态(终审 P2-2)
  const [previewDark, setPreviewDark] = useState(() =>
    resolveDark(settings.theme, systemPrefersDark())
  )
  const [failed, setFailed] = useState(false)

  // 创建/销毁只随挂载:选项变化走下面的 effect,不重建实例(重建会丢滚入位置与闪一下)
  useEffect(() => {
    const container = containerRef.current
    if (!container) {
      return
    }
    let terminal: Terminal
    try {
      terminal = new Terminal({
        cols: PREVIEW_COLS,
        rows: PREVIEW_ROWS,
        disableStdin: true,
        cursorBlink: false,
        fontSize: 12,
        scrollback: 0,
        convertEol: true
      })
    } catch (error) {
      console.error('创建预览终端失败,预览区将以占位显示:', error)
      setFailed(true) // 契约要求失败有占位文案(终审 P2-3),不留空白边框
      return
    }
    terminal.open(container)
    terminal.write(PREVIEW_BUFFER)
    terminalRef.current = terminal
    return () => {
      terminalRef.current = null
      terminal.dispose()
    }
  }, [])

  // 设置或预览深浅变化:整包应用解析输出(与真实终端同一个函数、同一套字段)
  useEffect(() => {
    const terminal = terminalRef.current
    if (!terminal) {
      return
    }
    const appearance = resolveTerminalAppearance(settings, previewDark)
    terminal.options = {
      fontFamily: appearance.fontFamily,
      fontSize: appearance.fontSize, // 如实反映字号:大了由容器滚动容纳,不做截断(预览不许骗人)
      fontWeight: appearance.fontWeight,
      fontWeightBold: appearance.fontWeightBold,
      lineHeight: appearance.lineHeight,
      cursorStyle: appearance.cursorStyle,
      cursorBlink: appearance.cursorBlink,
      theme: appearance.theme
    }
  }, [settings, previewDark])

  return (
    <div className="my-2 rounded border border-line">
      <div className="flex items-center justify-between border-b border-line px-2 py-1">
        <span className="text-xs text-ink-muted">预览</span>
        <Button
          variant="ghost"
          aria-label={previewDark ? '预览切换到浅色(仅预览)' : '预览切换到深色(仅预览)'}
          title="仅切换预览,不改主题设置"
          className="!px-1 !py-0.5"
          onClick={() => setPreviewDark((dark) => !dark)}
        >
          {previewDark ? <Moon className="size-3.5" aria-hidden /> : <Sun className="size-3.5" aria-hidden />}
        </Button>
      </div>
      {failed ? (
        <p className="p-2 text-xs text-ink-muted">预览不可用(终端渲染器未初始化),外观设置不受影响。</p>
      ) : (
        <div
          ref={containerRef}
          className="overflow-auto p-1"
          data-scrollbars="sleek"
          aria-label="终端外观预览"
        />
      )}
    </div>
  )
}
