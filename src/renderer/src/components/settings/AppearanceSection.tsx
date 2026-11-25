// 外观分区(T6;第二版 T-R4 改单槽):界面主题与终端主题各一个下拉,终端外观六项 + 预览块(T7 挂载点)。
// 每项 onChange 只发单字段 patch;外观落地由 App 层 effect 显式调用唯一写手(J-004),
// 控件不再各自重放——第一版的 patchAppearance 已随 ThemeToggle 删除(见 tasks/T-R4.md)。
import { useMemo } from 'react'
import { APP_THEMES } from '../../../../shared/themes/app-themes'
import {
  DARK_TERMINAL_THEME_NAMES,
  LIGHT_TERMINAL_THEME_NAMES
} from '../../../../shared/themes/catalog'
import { TERMINAL_FONT_OPTIONS } from '../../../../shared/themes/fonts'
import { updateSettings, useSettings } from '../../store/settings-slice'
import type { Settings } from '../../../../shared/types'
import { TerminalPreview } from './TerminalPreview'
import { NumberField } from './NumberField'

const FONT_WEIGHTS: Array<{ value: number; label: string }> = [
  { value: 300, label: '细(300)' },
  { value: 400, label: '常规(400)' },
  { value: 500, label: '中粗(500)' }
]

const CURSOR_STYLES: Array<{ value: Settings['terminalCursorStyle']; label: string }> = [
  { value: 'block', label: '方块' },
  { value: 'bar', label: '竖线' },
  { value: 'underline', label: '下划线' }
]

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <label className="flex items-center justify-between gap-3 py-1.5">
      <span className="min-w-0">
        <span className="block text-sm">{label}</span>
        {hint && <span className="block text-xs text-ink-muted">{hint}</span>}
      </span>
      <span className="shrink-0">{children}</span>
    </label>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <h3 className="mt-2 mb-1 text-xs font-medium text-ink-muted">{children}</h3>
}

const controlClass =
  'rounded border border-line bg-transparent px-1.5 py-0.5 text-sm outline-none focus:border-ink-muted'
// 主题/字体下拉需要容纳最长项(如 "Ghostty Default Style Dark"),否则原生 select 会把名字截断
const selectClass = `${controlClass} w-60`

export function AppearanceSection(): React.JSX.Element {
  const settings = useSettings((current) => current)

  // 两组分组显示:深色在前浅色在后(APP_THEMES 数组顺序即定选清单顺序,分组不重排)
  const darkAppThemes = useMemo(() => APP_THEMES.filter((theme) => theme.isDark), [])
  const lightAppThemes = useMemo(() => APP_THEMES.filter((theme) => !theme.isDark), [])

  const patch = (patchValue: Partial<Settings>): void => {
    void updateSettings(patchValue)
  }

  return (
    <section aria-label="外观">
      <SectionTitle>界面主题</SectionTitle>
      <Row label="主题" hint="12 套单色板,选一套即整界面换色">
        <select
          className={selectClass}
          value={settings.appTheme}
          onChange={(event) => patch({ appTheme: event.target.value })}
        >
          <optgroup label="深色">
            {darkAppThemes.map((theme) => (
              <option key={theme.id} value={theme.id}>
                {theme.name}
              </option>
            ))}
          </optgroup>
          <optgroup label="浅色">
            {lightAppThemes.map((theme) => (
              <option key={theme.id} value={theme.id}>
                {theme.name}
              </option>
            ))}
          </optgroup>
        </select>
      </Row>

      <TerminalPreview settings={settings} />

      <SectionTitle>终端主题</SectionTitle>
      <Row label="配色" hint="22 套 Orca 内置终端主题">
        <select
          className={selectClass}
          value={settings.terminalTheme}
          onChange={(event) => patch({ terminalTheme: event.target.value })}
        >
          <optgroup label="深色">
            {DARK_TERMINAL_THEME_NAMES.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </optgroup>
          <optgroup label="浅色">
            {LIGHT_TERMINAL_THEME_NAMES.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </optgroup>
        </select>
      </Row>

      <SectionTitle>终端外观</SectionTitle>
      <Row label="字体">
        <select
          className={selectClass}
          value={settings.terminalFontFamily ?? ''}
          onChange={(event) => patch({ terminalFontFamily: event.target.value })}
        >
          {TERMINAL_FONT_OPTIONS.map((option) => (
            <option key={option.label} value={option.value ?? ''}>
              {option.label}
            </option>
          ))}
        </select>
      </Row>
      <Row label="字号" hint="8 ~ 32">
        <NumberField
          ariaLabel="终端字号"
          min={8}
          max={32}
          value={settings.terminalFontSize}
          onCommit={(next) => patch({ terminalFontSize: next })}
          className={`${controlClass} w-20`}
        />
      </Row>
      <Row label="字重">
        <select
          className={selectClass}
          value={settings.terminalFontWeight}
          onChange={(event) => patch({ terminalFontWeight: Number(event.target.value) })}
        >
          {FONT_WEIGHTS.map((weight) => (
            <option key={weight.value} value={weight.value}>
              {weight.label}
            </option>
          ))}
        </select>
      </Row>
      <Row label="行高" hint="1.0 ~ 2.0">
        <NumberField
          ariaLabel="终端行高"
          min={1}
          max={2}
          step={0.1}
          value={settings.terminalLineHeight}
          onCommit={(next) => patch({ terminalLineHeight: next })}
          className={`${controlClass} w-20`}
        />
      </Row>
      <Row label="光标样式">
        <select
          className={selectClass}
          value={settings.terminalCursorStyle}
          onChange={(event) =>
            patch({ terminalCursorStyle: event.target.value as Settings['terminalCursorStyle'] })
          }
        >
          {CURSOR_STYLES.map((style) => (
            <option key={style.value} value={style.value}>
              {style.label}
            </option>
          ))}
        </select>
      </Row>
      <Row label="光标闪烁">
        <input
          type="checkbox"
          checked={settings.terminalCursorBlink}
          onChange={(event) => patch({ terminalCursorBlink: event.target.checked })}
        />
      </Row>
    </section>
  )
}
