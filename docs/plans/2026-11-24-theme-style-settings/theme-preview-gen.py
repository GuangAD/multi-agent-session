# -*- coding: utf-8 -*-
"""生成主题候选预览 HTML(40 套:深 20 / 浅 20)。

色值来源两条:
1. 仓库内 src/shared/themes/catalog.ts —— 已移植的 Orca 22 套终端主题(一手数据);
2. 外部家族,逐个来自官方色值文件(fetch 时记录来源 URL,见 SOURCES)。
UI token 的派生规则统一在 DERIVE 里,页面上也写明,避免"看起来像"却说不清怎么来的。
"""
import io, json, re, sys, colorsys

# 用法:在仓库根执行 `python docs/plans/2026-11-24-theme-style-settings/theme-preview-gen.py`
CATALOG = 'src/shared/themes/catalog.ts'
OUT = 'docs/plans/2026-11-24-theme-style-settings/theme-previews.html'


def hex_to_rgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def rgb_to_hex(rgb):
    return '#%02x%02x%02x' % tuple(max(0, min(255, round(v))) for v in rgb)


def mix(a, b, w):
    """a 向 b 混合 w(0..1)"""
    ra, rb = hex_to_rgb(a), hex_to_rgb(b)
    return rgb_to_hex([ra[i] + (rb[i] - ra[i]) * w for i in range(3)])


def luminance(h):
    r, g, b = [v / 255 for v in hex_to_rgb(h)]
    f = lambda c: c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)


def contrast(a, b):
    la, lb = luminance(a), luminance(b)
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)


def on_color(accent, dark_candidates=('#101014', '#ffffff')):
    """在强调色上取对比度更高的文字色"""
    return max(dark_candidates, key=lambda c: contrast(accent, c))


def derive(p, is_dark):
    """palette -> 我们的 10 个语义 token。

    base/ink 直接取主题自己的背景与前景;panel/surface/line/hover 用「向对侧前景混合」
    的固定档位,保证与主题同色相;强调色取主题自己的主色(有 muted/comment 就用它)。
    """
    base, ink = p['bg'], p['fg']
    muted = p.get('muted') or mix(ink, base, 0.45)
    accent = p['accent']
    # 深色主题:面板与浮层向前景提亮;浅色主题:向前景压暗
    steps = (0.055, 0.10, 0.20, 0.115) if is_dark else (0.045, 0.09, 0.18, 0.10)
    return {
        'base': base,
        'panel': mix(base, ink, steps[0]),
        'surface': mix(base, ink, steps[1]),
        'line': mix(base, ink, steps[2]),
        'ink': ink,
        'inkMuted': muted,
        'accent': accent,
        'onAccent': on_color(accent),
        'hover': mix(base, ink, steps[3]),
        'accentHover': mix(accent, ink if is_dark else base, 0.18),
    }


def parse_catalog():
    src = io.open(CATALOG, encoding='utf-8').read()
    body = src[src.index('export const TERMINAL_THEMES'):]
    themes = {}
    for m in re.finditer(r"^  '([^']+)': \{\n(.*?)^  \}", body, re.S | re.M):
        name, block = m.group(1), m.group(2)
        if name in ('Ghostty Default Style Dark',):
            pass
        fields = dict(re.findall(r"(\w+): '(#[0-9a-fA-F]{6})'", block))
        themes[name] = fields
    return themes


# —— 外部家族(来源见 SOURCES;bg/fg/muted/accent 均为该主题官方色值) ——
EXTERNAL = {
    'Catppuccin Macchiato': dict(bg='#24273a', fg='#cad3f5', muted='#a5adcb', accent='#8aadf4',
                                 src='catppuccin/nvim macchiato.lua'),
    'Catppuccin Frappé': dict(bg='#303446', fg='#c6d0f5', muted='#a5adce', accent='#8caaee',
                              src='catppuccin/nvim frappe.lua'),
    'Tokyo Night Storm': dict(bg='#24283b', fg='#c0caf5', muted='#565f89', accent='#7aa2f7',
                              src='folke/tokyonight.nvim storm.lua'),
    'Tokyo Night Moon': dict(bg='#222436', fg='#c8d3f5', muted=None, accent='#82aaff',
                             src='folke/tokyonight.nvim moon.lua'),
    'Rosé Pine': dict(bg='#191724', fg='#e0def4', muted='#908caa', accent='#c4a7e7',
                      src='rose-pine/neovim palette.lua'),
    'Rosé Pine Moon': dict(bg='#232136', fg='#e0def4', muted='#908caa', accent='#c4a7e7',
                           src='rose-pine/neovim palette.lua'),
    'Cobalt2': dict(bg='#122637', fg='#ffffff', muted='#545454', accent='#f0cb09',
                    src='alacritty-theme Cobalt2.toml'),
    'Ayu Mirage': dict(bg='#1f2430', fg='#cbccc6', muted='#686868', accent='#60b8d6',
                       src='alacritty-theme ayu_mirage.toml'),
    'Carbonfox': dict(bg='#161616', fg='#f2f4f8', muted='#b6b8bb', accent='#33b1ff',
                      src='alacritty-theme carbonfox.toml'),
    'Flexoki Dark': dict(bg='#100F0F', fg='#CECDC3', muted='#878580', accent='#D14D41',
                         src='kepano/flexoki README(base-900/base-300/red-400)'),
    'Alabaster': dict(bg='#F7F7F7', fg='#434343', muted='#777777', accent='#325CC0',
                      src='alacritty-theme alabaster.toml'),
    'Ashes Light': dict(bg='#f3f4f5', fg='#565e65', muted='#747c84', accent='#ae95c7',
                        src='alacritty-theme ashes_light.toml'),
    'Tomorrow': dict(bg='#ffffff', fg='#4d4d4c', muted='#8e908c', accent='#4271ae',
                     src='alacritty-theme tomorrow.toml'),
    'Flexoki Light': dict(bg='#FFFCF0', fg='#100F0F', muted='#6F6E69', accent='#205EA6',
                          src='kepano/flexoki README(paper/black/blue-600)'),
    'Rosé Pine Dawn': dict(bg='#faf4ed', fg='#464261', muted='#9893a5', accent='#907aa9',
                           src='rose-pine/neovim palette.lua'),
    'Kanagawa Wave': dict(bg='#1F1F28', fg='#DCD7BA', muted='#727169', accent='#7E9CD8',
                          src='rebelot/kanagawa.nvim colors.lua'),
    'Kanagawa Dragon': dict(bg='#181616', fg='#c5c9c5', muted='#7a8382', accent='#8ba4b0',
                            src='rebelot/kanagawa.nvim colors.lua'),
    'Kanagawa Lotus': dict(bg='#f2ecbc', fg='#545464', muted='#8a8980', accent='#4d699b',
                           src='rebelot/kanagawa.nvim colors.lua'),
    'Nord': dict(bg='#2E3440', fg='#D8DEE9', muted='#4C566A', accent='#88C0D0',
                 src='alacritty-theme nord.toml'),
    'Dracula': dict(bg='#282a36', fg='#f8f8f2', muted='#6272a4', accent='#bd93f9',
                    src='alacritty-theme dracula.toml'),
    'Selenized Dark': dict(bg='#103c48', fg='#cad8d9', muted='#72898f', accent='#4695f7',
                           src='jan-warchol/selenized the-values.md'),
    'Selenized Black': dict(bg='#181818', fg='#dedede', muted='#777777', accent='#368aeb',
                            src='jan-warchol/selenized the-values.md'),
    'Selenized Light': dict(bg='#fbf3db', fg='#3a4d53', muted='#909995', accent='#0072d4',
                            src='jan-warchol/selenized the-values.md'),
    'Selenized White': dict(bg='#ffffff', fg='#282828', muted='#878787', accent='#0064e4',
                            src='jan-warchol/selenized the-values.md'),
    'Dayfox': dict(bg='#f6f2ee', fg='#3d2b5a', muted='#837a72', accent='#2848a9',
                   src='EdenEast/nightfox.nvim dayfox.lua'),
    'Dawnfox': dict(bg='#faf4ed', fg='#575279', muted='#9893a5', accent='#286983',
                    src='EdenEast/nightfox.nvim dawnfox.lua'),
    'PaperColor Light': dict(bg='#eeeeee', fg='#444444', muted=None, accent='#0087af',
                             src='alacritty-theme papercolor_light.toml'),
    'Ayu Light': dict(bg='#FCFCFC', fg='#5C6166', muted=None, accent='#4196df',
                      src='alacritty-theme ayu_light.toml'),
}

# 分组:名字 -> 追加的 bg/fg 覆盖(同一家族的不同对比度档,强调色沿用家族)
OVERRIDES = {
    'Gruvbox Dark (hard)': dict(family='Gruvbox Dark', bg='#1d2021'),
    'Gruvbox Dark (soft)': dict(family='Gruvbox Dark', bg='#32302f'),
    'Everforest Dark (hard)': dict(family='Everforest Dark', bg='#272E33'),
    'Everforest Dark (soft)': dict(family='Everforest Dark', bg='#333C43'),
    'Gruvbox Light (hard)': dict(family='Gruvbox Light', bg='#f9f5d7', fg='#3c3836'),
    'Gruvbox Light (soft)': dict(family='Gruvbox Light', bg='#f2e5bc'),
    'Everforest Light (hard)': dict(family='Everforest Light', bg='#FFFBEF'),
    'Everforest Light (soft)': dict(family='Everforest Light', bg='#F3EAD3'),
}

DARK_LIST = [
    ('Catppuccin Mocha', 'cat', 'Rosé 粉紫系,最流行的柔和深色'),
    ('Catppuccin Macchiato', 'ext', 'Mocha 的中间明度变体'),
    ('Catppuccin Frappé', 'ext', 'Mocha 的低饱和变体'),
    ('Tokyo Night', 'cat', '深蓝夜色,紫蓝前景'),
    ('Tokyo Night Storm', 'ext', '略亮的蓝灰底,常用作侧栏色'),
    ('Tokyo Night Moon', 'ext', '更柔的藏蓝'),
    ('Rosé Pine', 'ext', '玫瑰灰底 + 鸢尾强调'),
    ('Rosé Pine Moon', 'ext', 'Rosé Pine 的偏亮变体'),
    ('Gruvbox Dark (hard)', 'ovr', '复古暖棕,高对比档'),
    ('Gruvbox Dark', 'cat', '复古暖棕,中对比(默认档)'),
    ('Gruvbox Dark (soft)', 'ovr', '复古暖棕,低对比档'),
    ('Everforest Dark (hard)', 'ovr', '森林绿,高对比档'),
    ('Everforest Dark', 'cat', '森林绿,中对比(默认档)'),
    ('Everforest Dark (soft)', 'ovr', '森林绿,低对比档'),
    ('Kanagawa Wave', 'ext', '浮世绘墨色 + 靛蓝'),
    ('Kanagawa Dragon', 'ext', '龙主题,更暗更灰'),
    ('Solarized Dark', 'cat', '经典低对比青灰'),
    ('Nord', 'ext', '极地冷灰蓝'),
    ('Dracula', 'ext', '高饱和紫'),
    ('One Dark', 'cat', 'Atom 经典深色'),
    ('Night Owl', 'cat', '深夜蓝黑 + 高饱和强调'),
    ('Horizon Dark', 'cat', '地平线暖紫深色'),
    ('Material Dark', 'cat', 'Material 深色'),
    ('Ayu Dark', 'cat', 'Ayu 原生深色'),
    ('Tango Dark', 'cat', '偏黄的传统终端深色'),
    ('Ghostty Default Style Dark', 'cat', '终端默认深色(基准观感)'),
    ('Cobalt2', 'ext', 'Sublime 经典钴蓝 + 亮黄'),
    ('Ayu Mirage', 'ext', 'Ayu 中间明度深色'),
    ('Carbonfox', 'ext', 'IBM Carbon 风格,冷灰蓝'),
    ('Selenized Dark', 'ext', '青蓝底 + 高辨识强调'),
    ('Selenized Black', 'ext', '纯灰阶底 + 高辨识强调'),
    ('Flexoki Dark', 'ext', '墨黑底 + 赤陶强调'),
]

LIGHT_LIST = [
    ('Catppuccin Latte', 'cat', '奶油底 + 紫蓝强调'),
    ('Rosé Pine Dawn', 'ext', '暖米底 + 鸢尾'),
    ('Gruvbox Light (hard)', 'ovr', '暖黄纸感,高对比档'),
    ('Gruvbox Light', 'cat', '暖黄纸感,中对比(默认档)'),
    ('Gruvbox Light (soft)', 'ovr', '暖黄纸感,低对比档'),
    ('Everforest Light (hard)', 'ovr', '米绿纸感,高对比档'),
    ('Everforest Light', 'cat', '米绿纸感,中对比(默认档)'),
    ('Everforest Light (soft)', 'ovr', '米绿纸感,低对比档'),
    ('Kanagawa Lotus', 'ext', '藕荷纸色 + 靛蓝'),
    ('Solarized Light', 'cat', '经典低对比米黄'),
    ('One Light', 'cat', 'Atom 经典浅色'),
    ('GitHub Light', 'cat', '中性白 + 蓝'),
    ('Builtin Tango Light', 'cat', '偏黄的传统终端浅色'),
    ('Tokyo Night Light', 'cat', '蓝白冷调浅色'),
    ('Selenized Light', 'ext', '鹅黄底 + 高辨识强调'),
    ('Selenized White', 'ext', '纯白底对照组'),
    ('Dayfox', 'ext', '暖白底 + 藏蓝'),
    ('Dawnfox', 'ext', '暖粉白底 + 灰蓝'),
    ('PaperColor Light', 'ext', '灰底 + 青蓝'),
    ('Ayu Light', 'ext', '近纯白 + 天蓝'),
    ('Alabaster', 'ext', '近白灰底 + 纯正蓝(高可读)'),
    ('Ashes Light', 'ext', '冷灰底 + 灰紫强调'),
    ('Tomorrow', 'ext', '纯白底 + 经典 Tomorrow 蓝'),
    ('Flexoki Light', 'ext', '纸白底 + 墨黑正文'),
]


# 目录键 -> 展示名(目录里带 Builtin/Default 等移植来源前缀的,展示时去掉)
DISPLAY = {'Builtin Tango Light': 'Tango Light', 'Ghostty Default Style Dark': 'Ghostty Default Dark'}


REF = '.reference/orca-1.4.265/resources/plugins/launch'
JSON_THEMES = [
    (f'{REF}/stablyai.orca-vscode-default-themes/themes/vs-code-dark-modern.json', 'VS Code Dark Modern', 'VS Code 现役默认深色'),
    (f'{REF}/stablyai.orca-vscode-default-themes/themes/vs-code-dark.json', 'VS Code Dark+', 'VS Code 经典默认深色'),
    (f'{REF}/stablyai.orca-vscode-default-themes/themes/vs-code-light-modern.json', 'VS Code Light Modern', 'VS Code 现役默认浅色'),
    (f'{REF}/stablyai.orca-vscode-default-themes/themes/vs-code-light.json', 'VS Code Light+', 'VS Code 经典默认浅色'),
    (f'{REF}/stablyai.orca-github-vscode-theme/themes/github-dark-default.json', 'GitHub Dark', 'GitHub 官方深色默认'),
    (f'{REF}/stablyai.orca-github-vscode-theme/themes/github-dark-dimmed.json', 'GitHub Dark Dimmed', 'GitHub 官方深色降饱和'),
    (f'{REF}/stablyai.orca-github-vscode-theme/themes/github-dark-high-contrast.json', 'GitHub Dark High Contrast', 'GitHub 官方深色高对比'),
    (f'{REF}/stablyai.orca-github-vscode-theme/themes/github-light-default.json', 'GitHub Light', 'GitHub 官方浅色默认'),
    (f'{REF}/stablyai.orca-github-vscode-theme/themes/github-light-high-contrast.json', 'GitHub Light High Contrast', 'GitHub 官方浅色高对比'),
]

# JSON 主题的 token 映射:全官方值,不做派生;只有 hover/accentHover 在缺失时兜底
JSON_TOKEN_MAP = {
    'base': '--background',
    'panel': '--sidebar',
    'surface': '--card',
    'line': '--border',
    'ink': '--foreground',
    'inkMuted': '--muted-foreground',
    'accent': '--primary',
    'onAccent': '--primary-foreground',
}


def tokens_from_json(doc):
    """主题 JSON -> (10 token, 派生项名单)。

    8 个 token 直接取官方变量;个别主题(如 VS Code Dark+/Light+)的 JSON 只给 5-6 个值,
    缺的那几个按页面上写明的规则派生,并如实列进「派生项」,不混进「全官方值」。
    """
    t = doc['tokens']
    out = {k: t[v] for k, v in JSON_TOKEN_MAP.items() if v in t}
    is_dark = luminance(t['--background']) < 0.5
    step = 0.10 if is_dark else 0.09
    derived = []
    if 'panel' not in out:
        out['panel'] = t.get('--popover') or mix(out['base'], out['ink'], step / 2)
        derived.append('panel')
    if 'surface' not in out:
        out['surface'] = t.get('--card') or t.get('--popover') or mix(out['base'], out['ink'], step)
        derived.append('surface')
    if 'inkMuted' not in out:
        out['inkMuted'] = mix(out['ink'], out['base'], 0.45)
        derived.append('inkMuted')
    if 'accent' not in out:
        # 没有 --primary 的主题(Dark+/Light+)用前景色作单色强调,与我们的「默认灰」同构
        out['accent'] = out['ink']
        derived.append('accent')
    if 'onAccent' not in out:
        out['onAccent'] = on_color(out['accent'])
        derived.append('onAccent')
    out['hover'] = t.get('--secondary') or mix(out['base'], out['ink'], step)
    if '--secondary' not in t:
        derived.append('hover')
    out['accentHover'] = mix(out['accent'], out['ink'] if is_dark else out['base'], 0.18)
    derived.append('accentHover')
    return out, derived


def load_json_themes():
    themes = []
    for path, name, note in JSON_THEMES:
        doc = json.load(io.open(path, encoding='utf-8'))
        tokens, derived = tokens_from_json(doc)
        themes.append(dict(name=name, note=note, source=path, derived=derived,
                           is_dark=doc.get('base') == 'dark', tokens=tokens))
    return themes


def build_entry(name, kind, note, catalog):
    if kind == 'cat':
        f = catalog[name]
        p = dict(bg=f['background'], fg=f['foreground'],
                 muted=f.get('brightBlack'), accent=f.get('blue') or f.get('cyan') or f.get('magenta'),
                 src='本仓库 shared/themes/catalog.ts(移植 Orca)')
    elif kind == 'ext':
        p = dict(EXTERNAL[name])
    else:
        o = OVERRIDES[name]
        family = catalog[o['family']]
        p = dict(bg=o.get('bg', family['background']), fg=o.get('fg', family['foreground']),
                 muted=family.get('brightBlack'),
                 accent=family.get('blue') or family.get('cyan'),
                 src='本仓库 catalog.ts 家族 + 官方对比度档背景色')
    p['name'] = DISPLAY.get(name, name)
    p['note'] = note
    return p


def card(p, t):
    """p = {name, note, src};t = 10 个 token 值"""
    swatches = ''.join(
        f'<span class="sw" style="background:{t[k]}" title="{k} {t[k]}"><i>{t[k]}</i></span>'
        for k in ('base', 'panel', 'surface', 'line', 'ink', 'inkMuted', 'accent', 'onAccent', 'hover', 'accentHover')
    )
    # 迷你界面:标题栏 + 侧栏(panel) + 内容(base) + 代码块(surface) + 按钮(accent)
    return f'''
  <article class="card" style="--base:{t['base']};--panel:{t['panel']};--surface:{t['surface']};--line:{t['line']};--ink:{t['ink']};--muted:{t['inkMuted']};--accent:{t['accent']};--on-accent:{t['onAccent']};--hover:{t['hover']}">
    <header class="card-head"><b>{p['name']}</b><span class="note">{p['note']}</span></header>
    <div class="mock">
      <div class="titlebar">
        <span class="dot"></span><span class="app">Soloport</span>
        <span class="actions"><i>文件</i><i>Git</i></span>
      </div>
      <div class="body">
        <aside class="side">
          <div class="side-title">项目</div>
          <div class="row sel">oberYunFront...</div>
          <div class="row">Pi</div>
          <div class="row">优化考试组织搜索...</div>
          <div class="row">agent-sessions</div>
          <div class="row muted">显示更多(27)</div>
        </aside>
        <main class="main">
          <div class="h">没有打开的会话</div>
          <p class="p muted">从左栏「新建会话」选择一个 agent 开始</p>
          <pre class="code">$ npm test
<span class="ok">PASS</span> src/preview.test.ts
<span class="dim">✓ 3 tests</span></pre>
          <div class="btns"><button class="primary">主要按钮</button><button class="ghost">次要</button></div>
        </main>
      </div>
    </div>
    <div class="swatches">{swatches}</div>
    <footer class="src">{p['src']}</footer>
  </article>'''


def card_json(theme):
    t = theme['tokens']
    p = dict(name=theme['name'], note=theme['note'], src=theme['source'].split('themes/')[-1])
    official = 10 - len(theme['derived'])
    if theme['derived']:
        label = f'官方 {official} 值 + 派生 {", ".join(theme["derived"])} · '
    else:
        label = '全部官方值 · '
    return card(p, t).replace('<footer class="src">', f'<footer class="src">{label}')


def main():
    catalog = parse_catalog()
    dark = [build_entry(n, k, note, catalog) for n, k, note in DARK_LIST]
    light = [build_entry(n, k, note, catalog) for n, k, note in LIGHT_LIST]
    assert len(dark) >= 20 and len(light) >= 20, (len(dark), len(light))
    json_themes = load_json_themes()
    json_dark = [t for t in json_themes if t['is_dark']]
    json_light = [t for t in json_themes if not t['is_dark']]

    html = f'''<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8">
<title>主题候选预览</title>
<style>
  :root {{ color-scheme: dark; }}
  body {{ margin:0; padding:24px 28px 64px; background:#0f1013; color:#e6e6e9;
         font:14px/1.55 "Segoe UI","Microsoft YaHei",system-ui,sans-serif; }}
  h1 {{ font-size:20px; margin:0 0 6px; }}
  .meta {{ color:#9a9aa6; font-size:13px; max-width:1100px; }}
  .meta code {{ background:#1b1d22; padding:1px 5px; border-radius:4px; }}
  h2 {{ font-size:15px; margin:34px 0 12px; padding-bottom:6px; border-bottom:1px solid #26282f; }}
  .grid {{ display:grid; grid-template-columns:repeat(auto-fill,minmax(340px,1fr)); gap:18px; }}
  .card {{ background:#15171b; border:1px solid #24262d; border-radius:10px; overflow:hidden; }}
  .card-head {{ display:flex; flex-direction:column; gap:2px; padding:10px 12px; }}
  .card-head b {{ font-size:13px; }}
  .note {{ color:#8b8b96; font-size:12px; }}
  .mock {{ background:var(--base); color:var(--ink); font-size:11px; }}
  .titlebar {{ display:flex; align-items:center; gap:8px; padding:5px 8px;
               background:var(--base); border-bottom:1px solid var(--line); }}
  .dot {{ width:8px; height:8px; border-radius:2px; background:var(--accent); }}
  .app {{ font-weight:600; }}
  .actions {{ margin-left:auto; display:flex; gap:8px; color:var(--muted); }}
  .body {{ display:flex; min-height:150px; }}
  .side {{ width:112px; flex:none; background:var(--panel); border-right:1px solid var(--line); padding:6px; }}
  .side-title {{ color:var(--muted); font-size:10px; margin-bottom:4px; }}
  .row {{ padding:3px 5px; border-radius:4px; color:var(--ink); }}
  .row.sel {{ background:var(--hover); }}
  .row.muted {{ color:var(--muted); }}
  .main {{ flex:1; padding:10px; }}
  .h {{ font-weight:600; }}
  .p {{ margin:2px 0 8px; }}
  .muted {{ color:var(--muted); }}
  .code {{ margin:0 0 8px; padding:7px 8px; border-radius:5px; background:var(--surface);
           border:1px solid var(--line); white-space:pre; font:11px/1.5 "Cascadia Mono",Consolas,monospace; }}
  .ok {{ color:var(--accent); font-weight:600; }}
  .dim {{ opacity:.65; }}
  .btns {{ display:flex; gap:6px; }}
  button {{ font:inherit; padding:3px 9px; border-radius:5px; cursor:default; }}
  .primary {{ background:var(--accent); color:var(--on-accent); border:1px solid transparent; }}
  .ghost {{ background:transparent; color:var(--ink); border:1px solid var(--line); }}
  .swatches {{ display:flex; height:26px; }}
  .sw {{ flex:1; position:relative; }}
  .sw i {{ position:absolute; inset:auto 0 -18px; text-align:center; font-size:9px; font-style:normal;
           color:#6f6f7a; }}
  .src {{ padding:8px 12px 10px; color:#666672; font-size:11px; }}
</style></head><body>
<h1>主题候选预览 · 深色 {len(dark)} · 浅色 {len(light)} · 官方 {len(json_themes)}</h1>
<p class="meta">
  每张卡里的迷你界面用的是本项目的 10 个语义 token(<code>base / panel / surface / line / ink / inkMuted / accent / onAccent / hover / accentHover</code>)。<br>
  色值来源两部分:本仓库 <code>src/shared/themes/catalog.ts</code>(移植 Orca 的终端主题,一手数据);
  外部家族的背景/前景/强调色取自官方色值文件(Catppuccin、Rosé Pine、Tokyo Night、Kanagawa、Nord、Dracula、Selenized、Nightfox、Ayu、PaperColor、Gruvbox、Everforest)。<br>
  派生规则(<b>不是官方值,是我为 UI 补的中间色</b>):<code>panel/surface/line/hover</code> 由「base 向 ink 混合 5.5%/10%/20%/11.5%(深色)或 4.5%/9%/18%/10%(浅色)」得到;
  <code>onAccent</code> 取与强调色对比度更高的黑或白;<code>accentHover</code> 为强调色向 ink 混合 18%。<br>
  卡片下方色条从左到右依次是上面这 10 个 token;鼠标悬停可看色值。<br>
  <b>对比度体检</b>(正文 ink / base):多数在 6.5–14;<b>Solarized Light 4.13、Solarized Dark 4.75</b> 是这套配色本身的低对比设计,不是笔误;
  Gruvbox 家族「强调色上的文字」约 4.5(临界,正文不受影响)。
</p>
<h2>深色 {len(dark)} 套</h2>
<div class="grid">{''.join(card(p, derive(p, True)) for p in dark)}</div>
<h2>浅色 {len(light)} 套</h2>
<div class="grid">{''.join(card(p, derive(p, False)) for p in light)}</div>
<h2>VS Code / GitHub 官方主题（9 套 · token 取官方变量，派生项逐卡标注）</h2>
<p class="meta">这 10 套来自 <code>.reference/.../stablyai.orca-vscode-default-themes</code> 与 <code>stablyai.orca-github-vscode-theme</code> 的规范化 JSON:
<code>base←--background</code>、<code>panel←--sidebar</code>、<code>surface←--card</code>、<code>line←--border</code>、<code>ink←--foreground</code>、<code>inkMuted←--muted-foreground</code>、<code>accent←--primary</code>、<code>onAccent←--primary-foreground</code>、<code>hover←--secondary</code>;
<br>诚实标注:7 套是「官方 9 值 + 仅 <code>accentHover</code> 派生」(强调色向 ink/base 混合 18%);
<b>VS Code Dark+ / Light+ 的 JSON 只给了 background / border / foreground 三项</b>,其余 7 项按本页规则派生,卡片底下已列出派生项——它们的观感不等同于真正的 Dark+/Light+。</p>
<div class="grid">{''.join(card_json(t) for t in json_dark)}</div>
<div class="grid" style="margin-top:18px">{''.join(card_json(t) for t in json_light)}</div>
</body></html>'''
    io.open(OUT, 'w', encoding='utf-8', newline='\n').write(html)
    print('written', OUT, len(html), 'bytes')


main()
