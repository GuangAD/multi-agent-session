// 通用分区(T6):默认 Shell 与回滚行数——两项此前只能手改 store.json,本任务首次给出界面。
// Shell 改动只影响之后新开的终端(既有语义,AGENTS.md/契约第 5 节);回滚行数按
// 「变化即重建实例」生效(TerminalView 既有 effect,scrollback 是创建期参数)。
import { updateSettings, useSettings } from '../../store/settings-slice'
import type { Settings, ShellKind } from '../../../../shared/types'

const SHELL_OPTIONS: Array<{ value: ShellKind; label: string }> = [
  { value: 'cmd', label: 'cmd' },
  { value: 'powershell', label: 'Windows PowerShell 5.1' },
  { value: 'pwsh', label: 'PowerShell 7+(需另装)' }
]

const controlClass =
  'rounded border border-line bg-transparent px-1.5 py-0.5 text-sm outline-none focus:border-ink-muted'

export function GeneralSection(): React.JSX.Element {
  const settings = useSettings((current) => current)

  const patch = (patchValue: Partial<Settings>): void => {
    void updateSettings(patchValue)
  }

  return (
    <section aria-label="通用" className="mt-4">
      <h3 className="mt-2 mb-1 text-xs font-medium text-ink-muted">通用</h3>
      <label className="flex items-center justify-between gap-3 py-1.5">
        <span className="min-w-0">
          <span className="block text-sm">默认 Shell</span>
          <span className="block text-xs text-ink-muted">会话终端里常驻的 shell,只影响之后新开的终端</span>
        </span>
        <span className="shrink-0">
          <select
            className={controlClass}
            value={settings.shell}
            onChange={(event) => patch({ shell: event.target.value as ShellKind })}
          >
            {SHELL_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </span>
      </label>
      <label className="flex items-center justify-between gap-3 py-1.5">
        <span className="min-w-0">
          <span className="block text-sm">回滚缓冲区行数</span>
          <span className="block text-xs text-ink-muted">1000 ~ 50000;改动即重建终端实例</span>
        </span>
        <span className="shrink-0">
          <input
            type="number"
            min={1000}
            max={50000}
            step={1000}
            className={`${controlClass} w-24`}
            value={settings.scrollbackRows}
            onChange={(event) => patch({ scrollbackRows: Number(event.target.value) })}
          />
        </span>
      </label>
    </section>
  )
}
