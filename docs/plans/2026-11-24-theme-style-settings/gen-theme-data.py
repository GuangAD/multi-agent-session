# -*- coding: utf-8 -*-
"""第二版改造:从 theme-selection-tokens.json 生成 app-themes.ts 与 theme-tokens.css 的主题块。

为什么用生成器而不是手抄:12 套 × 10 token = 120 个色值,手抄必错,且 CSS 与 TS 两份要严格一致
(app-themes-css.test.ts 会逐值比对)。生成器是唯一真值入口,改色只改 JSON 再跑一次。

用法(仓库根):python docs/plans/2026-11-24-theme-style-settings/gen-theme-data.py
输出:src/shared/themes/app-themes.ts、src/renderer/src/assets/theme-tokens.css(仅主题块部分)
"""
import io, json

TOKENS_JSON = 'docs/plans/2026-11-24-theme-style-settings/theme-selection-tokens.json'
OUT_TS = 'src/shared/themes/app-themes.ts'
OUT_CSS_MARKER = '/* —— 主题块(由 gen-theme-data.py 生成,勿手改) —— */'

# 展示名与 id:JSON 里是预览名,这里落成 kebab id + 中文/英文展示名
META = {
    'GitHub Dark': ('github-dark', 'GitHub Dark', True),
    'GitHub Dark High Contrast': ('github-dark-hc', 'GitHub Dark 高对比', True),
    'VS Code Dark Modern': ('vscode-dark-modern', 'VS Code Dark Modern', True),
    'Carbonfox': ('carbonfox', 'Carbonfox', True),
    'Tango Dark': ('tango-dark', 'Tango Dark', True),
    'VS Code Light+': ('vscode-light', 'VS Code Light+', False),
    'GitHub Light': ('github-light', 'GitHub Light', False),
    'Gruvbox Light (hard)': ('gruvbox-light-hard', 'Gruvbox Light 高对比', False),
    'Selenized White': ('selenized-white', 'Selenized White', False),
    'Tango Light': ('tango-light', 'Tango Light', False),
    'Flexoki Light': ('flexoki-light', 'Flexoki Light', False),
    'Tomorrow': ('tomorrow', 'Tomorrow', False),
}

# 深色在前、浅色在后:id 顺序即下拉顺序
ORDER = [
    'GitHub Dark', 'GitHub Dark High Contrast', 'VS Code Dark Modern', 'Carbonfox', 'Tango Dark',
    'VS Code Light+', 'GitHub Light', 'Gruvbox Light (hard)', 'Selenized White', 'Tango Light',
    'Flexoki Light', 'Tomorrow',
]

TOKEN_KEYS = ['base', 'panel', 'surface', 'line', 'ink', 'inkMuted', 'accent', 'onAccent', 'hover',
              'accentHover']
CSS_VARS = {
    'base': '--app-base', 'panel': '--app-panel', 'surface': '--app-surface', 'line': '--app-line',
    'ink': '--app-ink', 'inkMuted': '--app-ink-muted', 'accent': '--app-accent',
    'onAccent': '--app-on-accent', 'hover': '--app-hover', 'accentHover': '--app-accent-hover',
}


def emit_ts(data):
    ids = [META[n][0] for n in ORDER]
    id_union = '\n  | '.join(f"'{i}'" for i in ids)
    parts = []
    for name in ORDER:
        tid, label, is_dark = META[name]
        t = data[name]
        body = '\n'.join(f"      {k}: '{t[k]}'," for k in TOKEN_KEYS)
        parts.append(
            f"  {{\n    id: '{tid}',\n    name: '{label}',\n    isDark: {str(is_dark).lower()},\n"
            f"    tokens: {{\n{body}\n    }}\n  }},")
    themes = '\n'.join(parts)
    return f'''// 界面主题目录(第二版,J-005):每套一组 token + isDark,不再有深浅两形态。
// 色值来自主题调研与定选(docs/plans/2026-11-24-theme-style-settings/theme-selection-tokens.json,
// 由 gen-theme-data.py 生成,勿手改本文件);VS Code / GitHub 取规范化主题 JSON 官方值,
// Carbonfox / Selenized White 取各自官方色值,Tango / Gruvbox 取本仓库 catalog(仅 Gruvbox 换 hard 档背景)。
// 三处用户指定的主色覆盖已固化:github-dark 与 github-dark-hc 用 #0078d4,github-light 与
// gruvbox-light-hard 用 #000000。
export type AppThemeId =
  | {id_union}

// 界面语义 token 值(与 theme-tokens.css 的 --app-* 变量一一对应),色值一律 #rrggbb
export type AppTokenValues = {{
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
}}

// isDark 只用于 color-scheme 与主进程原生控件着色,不参与主题选择
export type AppTheme = {{ id: AppThemeId; name: string; isDark: boolean; tokens: AppTokenValues }}

export const APP_THEMES: AppTheme[] = [
{themes}
]

// 默认主题(首次启动 / 设置缺失):github-dark
export const DEFAULT_APP_THEME_ID: AppThemeId = 'github-dark'
'''


def emit_css(data):
    blocks = []
    for name in ORDER:
        tid = META[name][0]
        t = data[name]
        body = '\n'.join(f"  {CSS_VARS[k]}: {t[k]};" for k in TOKEN_KEYS)
        blocks.append(f'/* {META[name][1]} */\n.theme-{tid} {{\n{body}\n}}')
    return '\n\n'.join(blocks)


def main():
    data = json.load(io.open(TOKENS_JSON, encoding='utf-8'))
    missing = [n for n in ORDER if n not in data]
    assert not missing, f'JSON 缺主题:{missing}'

    io.open(OUT_TS, 'w', encoding='utf-8', newline='\n').write(emit_ts(data))

    # CSS:保留 :root 兜底与别名,只替换标记之后的主题块
    css_path = 'src/renderer/src/assets/theme-tokens.css'
    css = io.open(css_path, encoding='utf-8').read()
    head = css.split(OUT_CSS_MARKER)[0].rstrip()
    css_new = head + '\n\n' + OUT_CSS_MARKER + '\n\n' + emit_css(data) + '\n'
    io.open(css_path, 'w', encoding='utf-8', newline='\n').write(css_new)

    print('written', OUT_TS, 'and', css_path)
    print('themes:', len(ORDER))


main()
