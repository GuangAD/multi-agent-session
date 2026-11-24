// 外观分区(T6):界面主题双槽、终端主题双槽、终端外观六项 + 预览块(T7 挂载点)。
// 每项 onChange 即时发单字段 patch;界面侧主题改动后必须显式重放外观——
// updateSettings 只改 store 不触发重绘(ThemeToggle 的系统跟随 effect 在强制浅/深下直接 return,
// 见 tasks/T6.md「实施期补充」第 1 条)。
import { useMemo } from 'react'
import { APP_THEMES } from '../../../../shared/themes/app-themes'
import {
  DARK_TERMINAL_THEME_NAMES,
  LIGHT_TERMINAL_THEME_NAMES
} from '../../../../shared/themes/catalog'
import { TERMINAL_FONT_OPTIONS } from '../../../../shared/themes/fonts'
import { selectAppTheme } from '../../../../shared/themes/resolve'
import { applyAppearance, resolveDark, systemPrefersDark } from '../../theme'
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

  // 预览块与下拉共用同一份设置快照;主题名与字体名变化才重建预览选项(预览内部自行订阅)
  const appThemeOptions = useMemo(() => APP_THEMES.map((theme) => ({ id: theme.id, name: theme.name })), [])

  // 界面主题类改动:先落盘,再按解析结果重放外观(唯一写手 applyAppearance)
  const patchAppearance = (patch: Partial<Settings>): void => {
    void updateSettings(patch).then((next) => {
      const systemDark = systemPrefersDark()
      applyAppearance(resolveDark(next.theme, systemDark), selectAppTheme(next, systemDark).theme.id)
    })
  }

  const patch = (patchValue: Partial<Settings>): void => {
    void updateSettings(patchValue)
  }

  return (
    <section aria-label="外观">
      <SectionTitle>界面主题</SectionTitle>
      <Row label="深色时" hint="界面处于深色时使用的主题">
        <select
          className={selectClass}
          value={settings.appThemeDark}
          onChange={(event) => patchAppearance({ appThemeDark: event.target.value })}
        >
          {appThemeOptions.map((theme) => (
            <option key={theme.id} value={theme.id}>
              {theme.name}
            </option>
          ))}
        </select>
      </Row>
      <Row label="浅色时" hint="界面处于浅色时使用的主题">
        <select
          className={selectClass}
          value={settings.appThemeLight}
          onChange={(event) => patchAppearance({ appThemeLight: event.target.value })}
        >
          {appThemeOptions.map((theme) => (
            <option key={theme.id} value={theme.id}>
              {theme.name}
            </option>
          ))}
        </select>
      </Row>

      <SectionTitle>终端主题</SectionTitle>
      <Row label="深色时" hint="终端处于深色时使用的配色">
        <select
          className={selectClass}
          value={settings.terminalThemeDark}
          onChange={(event) => patch({ terminalThemeDark: event.target.value })}
        >
          {DARK_TERMINAL_THEME_NAMES.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </Row>
      <Row label="浅色时" hint="终端处于浅色时使用的配色">
        <select
          className={selectClass}
          value={settings.terminalThemeLight}
          onChange={(event) => patch({ terminalThemeLight: event.target.value })}
        >
          {LIGHT_TERMINAL_THEME_NAMES.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </Row>

      <TerminalPreview settings={settings} />

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
