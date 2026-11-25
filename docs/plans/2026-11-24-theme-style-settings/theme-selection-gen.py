# -*- coding: utf-8 -*-
"""选定 10 套的主题预览(5 深 + 5 浅),供最终落地前确认观感。

与 theme-preview-gen.py 的区别:只出选中的 10 套,并且:
- 有官方 UI token 的(VS Code / GitHub 的规范化 JSON)优先用官方值,缺项才派生;
- 两处用户指定覆盖在 OVERRIDES_ACCENT 里,并在卡片上标明;
- 每套额外输出可直接抄进 app-themes.ts 的 token 片段(refs/ 下)。

用法(仓库根):python docs/plans/2026-11-24-theme-style-settings/theme-selection-gen.py
"""
import io, json, re

CATALOG = 'src/shared/themes/catalog.ts'
REF = '.reference/orca-1.4.265/resources/plugins/launch'
OUT = 'docs/plans/2026-11-24-theme-style-settings/theme-selection-preview.html'


def hex_to_rgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def rgb_to_hex(rgb):
    return '#%02x%02x%02x' % tuple(max(0, min(255, round(v))) for v in rgb)


def mix(a, b, w):
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


def on_color(accent):
    return max(('#101014', '#ffffff'), key=lambda c: contrast(accent, c))


def derive(base, ink, muted, accent, is_dark, panel=None, surface=None, line=None, hover=None):
    steps = (0.055, 0.10, 0.20, 0.115) if is_dark else (0.045, 0.09, 0.18, 0.10)
    return {
        'base': base,
        'panel': panel or mix(base, ink, steps[0]),
        'surface': surface or mix(base, ink, steps[1]),
        'line': line or mix(base, ink, steps[2]),
        'ink': ink,
        'inkMuted': muted or mix(ink, base, 0.45),
        'accent': accent,
        'onAccent': on_color(accent),
        'hover': hover or mix(base, ink, steps[3]),
        'accentHover': mix(accent, ink if is_dark else base, 0.18),
    }


def parse_catalog():
    src = io.open(CATALOG, encoding='utf-8').read()
    body = src[src.index('export const TERMINAL_THEMES'):]
    out = {}
    for m in re.finditer(r"^  '([^']+)': \{\n(.*?)^  \}", body, re.S | re.M):
        out[m.group(1)] = dict(re.findall(r"(\w+): '(#[0-9a-fA-F]{6})'", m.group(2)))
    return out


def from_json(path):
    """规范化主题 JSON -> (tokens, 官方项数, 派生项)。字段与 token 一一对应。"""
    doc = json.load(io.open(path, encoding='utf-8'))
    t = doc['tokens']
    is_dark = luminance(t['--background']) < 0.5
    derived = []
    base = t['--background']
    ink = t['--foreground']
    accent = t.get('--primary')
    if accent is None:
        accent = ink
        derived.append('accent')
    on_accent = t.get('--primary-foreground')
    if on_accent is None:
        on_accent = on_color(accent)
        derived.append('onAccent')
    panel = t.get('--sidebar')
    if panel is None:
        panel = mix(base, ink, 0.055 if is_dark else 0.045)
        derived.append('panel')
    surface = t.get('--card') or t.get('--popover')
    if surface is None:
        surface = mix(base, ink, 0.10 if is_dark else 0.09)
        derived.append('surface')
    line = t.get('--border')
    if line is None:
        line = mix(base, ink, 0.20 if is_dark else 0.18)
        derived.append('line')
    muted = t.get('--muted-foreground')
    if muted is None:
        muted = mix(ink, base, 0.45)
        derived.append('inkMuted')
    hover = t.get('--secondary')
    if hover is None:
        hover = mix(base, ink, 0.115 if is_dark else 0.10)
        derived.append('hover')
    tokens = dict(base=base, panel=panel, surface=surface, line=line, ink=ink, inkMuted=muted,
                  accent=accent, onAccent=on_accent, hover=hover,
                  accentHover=mix(accent, ink if is_dark else base, 0.18))
    derived.append('accentHover')
    return tokens, 10 - len(derived), derived


def from_catalog(cat, name, bg=None, fg=None):
    f = cat[name]
    return derive(bg or f['background'], fg or f['foreground'], f.get('brightBlack'),
                  f.get('blue') or f.get('cyan') or f.get('magenta'),
                  luminance(bg or f['background']) < 0.5)


# —— 选定的 10 套 ——
# kind: 'json' 官方 JSON | 'cat' 仓库终端主题 | 'manual' 显式给值
SELECTION = [
    # 深色
    dict(name='VS Code Dark Modern', kind='json', is_dark=True,
         path=f'{REF}/stablyai.orca-vscode-default-themes/themes/vs-code-dark-modern.json',
         note='VS Code 现役默认深色'),
    dict(name='GitHub Dark', kind='json', is_dark=True,
         path=f'{REF}/stablyai.orca-github-vscode-theme/themes/github-dark-default.json',
         note='GitHub 官方深色', accent='#0078d4', accent_note='主色按你的指定改为 #0078d4'),
    dict(name='GitHub Dark High Contrast', kind='json', is_dark=True,
         path=f'{REF}/stablyai.orca-github-vscode-theme/themes/github-dark-high-contrast.json',
         note='GitHub 官方深色高对比', accent='#0078d4', accent_note='主色按你的指定改为 #0078d4(原为绿色 #09b43a)'),
    dict(name='Carbonfox', kind='manual', is_dark=True,
         bg='#161616', fg='#f2f4f8', muted='#b6b8bb', accent='#33b1ff',
         note='IBM Carbon 风格,冷灰蓝(来源 alacritty-theme carbonfox)'),
    dict(name='Tango Dark', kind='cat', is_dark=True, catalog='Tango Dark',
         note='偏黄的传统终端深色(仓库 catalog)'),
    # 浅色
    dict(name='VS Code Light+', kind='json', is_dark=False,
         path=f'{REF}/stablyai.orca-vscode-default-themes/themes/vs-code-light.json',
         note='VS Code 经典浅色'),
    dict(name='GitHub Light', kind='json', is_dark=False,
         path=f'{REF}/stablyai.orca-github-vscode-theme/themes/github-light-default.json',
         note='GitHub 官方浅色', accent='#000000', accent_note='主色按你的指定改为 #000000(单色强调)'),
    dict(name='Gruvbox Light (hard)', kind='cat', is_dark=False, catalog='Gruvbox Light',
         bg='#f9f5d7', fg='#3c3836', accent='#000000',
         accent_note='主色按你的指定改为 #000000(原为 aqua #458588)',
         note='Gruvbox 浅色高对比档(仓库 catalog + 官方 bg 档位)'),
    dict(name='Selenized White', kind='manual', is_dark=False,
         bg='#ffffff', fg='#282828', muted='#878787', accent='#0064e4',
         panel='#ebebeb', line='#cdcdcd',
         note='纯白底 + 高辨识蓝(来源 selenized the-values.md,panel/line 用其 bg_1/bg_2)'),
    dict(name='Tango Light', kind='cat', is_dark=False, catalog='Builtin Tango Light',
         note='偏黄的传统终端浅色(仓库 catalog)'),
    dict(name='Flexoki Light', kind='manual', is_dark=False,
         bg='#FFFCF0', fg='#100F0F', muted='#6F6E69', accent='#205EA6',
         panel='#F2F0E5', surface='#E6E4D9', line='#DAD8CE',
         note='纸白底 + 墨黑正文(kepano/flexoki paper/base-50/100/150/blue-600)'),
    dict(name='Tomorrow', kind='manual', is_dark=False,
         bg='#ffffff', fg='#4d4d4c', muted='#8e908c', accent='#4271ae',
         note='纯白底 + Tomorrow 蓝(alacritty-theme tomorrow)'),
]


def resolve(entry, cat):
    if entry['kind'] == 'json':
        tokens, official, derived = from_json(entry['path'])
        src = entry['path'].split('themes/')[-1] + f' · 官方 {official} 项'
        if derived:
            src += ' + 派生 ' + ', '.join(derived)
    elif entry['kind'] == 'cat':
        tokens = from_catalog(cat, entry['catalog'], entry.get('bg'), entry.get('fg'))
        src = '本仓库 shared/themes/catalog.ts'
        if entry.get('bg'):
            src += ' + 官方对比度档背景色'
    else:
        tokens = derive(entry['bg'], entry['fg'], entry.get('muted'), entry['accent'], entry['is_dark'],
                        entry.get('panel'), entry.get('surface'), entry.get('line'), entry.get('hover'))
        src = entry['note'].split('(')[-1].rstrip(')') if '(' in entry['note'] else entry['note']

    # 主色覆盖:不分来源统一生效(卡片上另行标注 accent_note)
    if entry.get('accent'):
        tokens['accent'] = entry['accent']
        tokens['onAccent'] = on_color(entry['accent'])
        tokens['accentHover'] = mix(entry['accent'],
                                    tokens['ink'] if entry['is_dark'] else tokens['base'], 0.18)
        if entry['kind'] == 'json':
            src += ' + 主色指定'
    return tokens, src


def card(name, note, src, t, accent_note=None):
    swatches = ''.join(
        f'<span class="sw" style="background:{t[k]}" title="{k} {t[k]}"><i>{t[k]}</i></span>'
        for k in ('base', 'panel', 'surface', 'line', 'ink', 'inkMuted', 'accent', 'onAccent', 'hover', 'accentHover'))
    extra = f'<div class="override">{accent_note}</div>' if accent_note else ''
    return f'''
  <article class="card" style="--base:{t['base']};--panel:{t['panel']};--surface:{t['surface']};--line:{t['line']};--ink:{t['ink']};--muted:{t['inkMuted']};--accent:{t['accent']};--on-accent:{t['onAccent']};--hover:{t['hover']}">
    <header class="card-head"><b>{name}</b><span class="note">{note}</span></header>
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
    {extra}
    <div class="swatches">{swatches}</div>
    <footer class="src">{src}</footer>
  </article>'''


CSS = '''
  :root { color-scheme: dark; }
  body { margin:0; padding:24px 28px 64px; background:#0f1013; color:#e6e6e9;
         font:14px/1.55 "Segoe UI","Microsoft YaHei",system-ui,sans-serif; }
  h1 { font-size:20px; margin:0 0 6px; }
  h2 { font-size:15px; margin:30px 0 12px; padding-bottom:6px; border-bottom:1px solid #26282f; }
  .meta { color:#9a9aa6; font-size:13px; max-width:1100px; }
  .meta code { background:#1b1d22; padding:1px 5px; border-radius:4px; }
  .grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(340px,1fr)); gap:18px; }
  .card { background:#15171b; border:1px solid #24262d; border-radius:10px; overflow:hidden; }
  .card-head { display:flex; flex-direction:column; gap:2px; padding:10px 12px; }
  .card-head b { font-size:13px; }
  .note { color:#8b8b96; font-size:12px; }
  .mock { background:var(--base); color:var(--ink); font-size:11px; }
  .titlebar { display:flex; align-items:center; gap:8px; padding:5px 8px;
              background:var(--base); border-bottom:1px solid var(--line); }
  .dot { width:8px; height:8px; border-radius:2px; background:var(--accent); }
  .app { font-weight:600; }
  .actions { margin-left:auto; display:flex; gap:8px; color:var(--muted); }
  .body { display:flex; min-height:150px; }
  .side { width:112px; flex:none; background:var(--panel); border-right:1px solid var(--line); padding:6px; }
  .side-title { color:var(--muted); font-size:10px; margin-bottom:4px; }
  .row { padding:3px 5px; border-radius:4px; color:var(--ink); }
  .row.sel { background:var(--hover); }
  .row.muted { color:var(--muted); }
  .main { flex:1; padding:10px; }
  .h { font-weight:600; }
  .p { margin:2px 0 8px; }
  .muted { color:var(--muted); }
  .code { margin:0 0 8px; padding:7px 8px; border-radius:5px; background:var(--surface);
          border:1px solid var(--line); white-space:pre; font:11px/1.5 "Cascadia Mono",Consolas,monospace; }
  .ok { color:var(--accent); font-weight:600; }
  .dim { opacity:.65; }
  .btns { display:flex; gap:6px; }
  button { font:inherit; padding:3px 9px; border-radius:5px; cursor:default; }
  .primary { background:var(--accent); color:var(--on-accent); border:1px solid transparent; }
  .ghost { background:transparent; color:var(--ink); border:1px solid var(--line); }
  .override { padding:4px 12px; font-size:11px; color:#8fb7d9; background:#12161b; }
  .swatches { display:flex; height:26px; }
  .sw { flex:1; }
  .sw i { display:block; text-align:center; font-size:9px; font-style:normal; color:#6f6f7a; margin-top:2px; }
  .src { padding:8px 12px 10px; color:#666672; font-size:11px; }
'''


def main():
    cat = parse_catalog()
    dark, light = [], []
    for entry in SELECTION:
        tokens, src = resolve(entry, cat)
        entry['_html'] = card(entry['name'], entry['note'], src, tokens, entry.get('accent_note'))
        entry['_tokens'] = tokens
        (dark if entry['is_dark'] else light).append(entry)

    def block(entries):
        return ''.join(e['_html'] for e in entries)

    html = f'''<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<title>选定主题预览 · 5 深 + 5 浅</title><style>{CSS}</style></head><body>
<h1>选定主题预览 · 深色 5 · 浅色 5</h1>
<p class="meta">
  你选定的 10 套。每张卡是用本项目的 10 个语义 token 渲染的迷你界面;下方色条从左到右:
  <code>base / panel / surface / line / ink / inkMuted / accent / onAccent / hover / accentHover</code>。<br>
  色值来源:VS Code 与 GitHub 四项取自 <code>.reference</code> 里 Orca 规范化的主题 JSON(字段一一对应);
  Carbonfox / Selenized White 取自各自官方色值;Tango Dark / Light、Gruvbox Light (hard) 取自仓库
  <code>src/shared/themes/catalog.ts</code>(Gruvbox 仅背景换官方 hard 档)。<br>
  <b>两处按你的指定覆盖</b>:GitHub Dark 主色 → <code>#0078d4</code>,GitHub Light 主色 → <code>#000000</code>,卡片上已标出。
</p>
<h2>深色 5 套</h2><div class="grid">{block(dark)}</div>
<h2>浅色 5 套</h2><div class="grid">{block(light)}</div>
</body></html>'''
    io.open(OUT, 'w', encoding='utf-8', newline='\n').write(html)

    # 同时把 token 落成可抄的清单,便于下一步实现
    dump = {e['name']: e['_tokens'] for e in SELECTION}
    io.open('docs/plans/2026-11-24-theme-style-settings/theme-selection-tokens.json', 'w',
            encoding='utf-8', newline='\n').write(json.dumps(dump, ensure_ascii=False, indent=2))
    print('written', OUT, len(html), 'bytes')
    for name, t in dump.items():
        print(f"  {name:28} ink/base {round(contrast(t['ink'], t['base']), 2):5} "
              f"btn {round(contrast(t['onAccent'], t['accent']), 2):5}  accent {t['accent']}")


main()
