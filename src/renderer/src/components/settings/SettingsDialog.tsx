// 设置对话框(T6,spec 模块划分 components/settings/):外观 + 通用两分区。
// 开合归 ui-slice,组件不持状态;每项改动即时 updateSettings(单字段 patch)并即时落盘,
// 「完成 / ✕ / Esc」只负责关闭——与既有主题按钮「即改即存」语义一致。
import { useEffect } from 'react'
import { X } from 'lucide-react'
import { useAppStore } from '../../store/app-store'
import { loadSettings } from '../../store/settings-slice'
import { Button } from '../ui/button'
import { AppearanceSection } from './AppearanceSection'
import { GeneralSection } from './GeneralSection'

export function SettingsDialog(): React.JSX.Element | null {
  const open = useAppStore((state) => state.settingsDialogOpen)
  const closeSettingsDialog = useAppStore((state) => state.closeSettingsDialog)

  // 打开时向主进程拉一次全量设置(store 可能是启动初载的旧值或初值镜像)
  useEffect(() => {
    if (!open) {
      return
    }
    void loadSettings().catch((error) => {
      console.error('打开设置时读取设置失败,沿用当前值:', error)
    })
  }, [open])

  // Esc 关闭:对话框是纯外观配置,不需要「有未保存改动」拦截
  useEffect(() => {
    if (!open) {
      return
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        closeSettingsDialog()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, closeSettingsDialog])

  if (!open) {
    return null
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="设置"
      onClick={closeSettingsDialog}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-xl flex-col rounded-lg bg-surface shadow-lg"
        // 面板内点击不冒泡到遮罩,否则点控件就把对话框关了
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex shrink-0 items-center justify-between border-b border-line px-4 py-2">
          <h2 className="text-sm font-semibold">设置</h2>
          <Button
            variant="ghost"
            aria-label="关闭设置"
            className="!px-1.5 !py-1"
            onClick={closeSettingsDialog}
          >
            <X className="size-4" aria-hidden />
          </Button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3" data-scrollbars="sleek">
          <AppearanceSection />
          <GeneralSection />
        </div>

        <footer className="flex shrink-0 justify-end border-t border-line px-4 py-2">
          <Button onClick={closeSettingsDialog}>完成</Button>
        </footer>
      </div>
    </div>
  )
}
