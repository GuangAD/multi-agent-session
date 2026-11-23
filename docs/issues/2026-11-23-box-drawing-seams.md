# 终端 box-drawing 边框出现规律暗点(DOM renderer 亚像素接缝)

> 2026-11-23 | 状态:**已定位并修复** | 根因:xterm DOM renderer 逐格放字体字形,cell 宽非整数(实测 8.203px)时浏览器亚像素栅格化在每格边界抗锯齿,连续 `─` 边框每格出一个暗点;修复 = 接入 @xterm/addon-webgl,box-drawing 走 CustomGlyphs 矢量自绘。

## 一、现象

pi 会话内,TUI 输入框边框的横线上有均匀分布的暗色断点(用户截图,间距恰为一格宽),整个横线呈虚线观感。竖边框同理受影响。PowerShell(Windows Terminal)里同一 pi 正常;Orca(同 xterm 6.1.0-beta.336)正常;本项目 dev 与构建版均复现,与机器无关。

## 二、根因链(逐段实证)

| 环节 | 结论 | 实证方式 |
|---|---|---|
| 边框字符 | pi-tui 用连续 `─`(U+2500)实线,`"─".repeat(width)`(editor.js:191),非虚线字符 | 读 pi-tui 1.6.0 源码 |
| 渲染器 | 本项目未挂 webgl addon → xterm 走 DOM renderer;Orca 挂 `@xterm/addon-webgl`(补丁清单 `@xterm__addon-webgl@0.20.0-beta.329`) | 对比双方 package.json / Orca `terminal-rendering/terminal-webgl-addon-loader.ts` |
| DOM 几何 | 边框行 200 个 `─` 单 span,每字符 advance 8.203px(非整数),letter-spacing -0.003125px,字体链命中 Cascadia Mono | CDP 探针读取 span getBoundingClientRect |
| 机理 | DOM renderer 每格独立放字体字形,浏览器在 8.203px 步进(小数坐标)上逐字形栅格化,字形端点在格子边界抗锯齿淡化 → 每格一个暗点(放大截图点间距 = 一格) | dev 实例重现 + 截图放大 |
| 对照 | webgl renderer 对 box-drawing/block/powerline 走 CustomGlyphs 矢量自绘(`boxDrawingDefinitions['─']`,SVG path),不依赖字体字形,xtermjs#2409 即为此修「字体渲染 box-drawing 出缝」 | xterm.js 官方源码/issue |

Windows Terminal 无此问题是因为 DirectWrite + Cascadia 字体级处理,不走 xterm;Orca 无此问题正是因为挂了 webgl addon。

## 三、修复

- 新增依赖 `@xterm/addon-webgl@0.20.0-beta.329`(对齐 Orca;xterm.js 官方 addon,同仓库同版本线,进渲染链的核心依赖)。
- `src/renderer/src/components/terminal/use-terminal.ts`:终端 `open()` 后 `try { terminal.loadAddon(new WebglAddon()) } catch {}`——`getContext('webgl2')` 失败会在 `loadAddon` 内同步 throw,接住即留在 DOM renderer,行为不劣于现状;context loss 由 addon 自 dispose 回退 DOM。裁剪点:Orca 的 lazy loader / auto policy / context loss 策略 / DPR 修复为多 pane + GPU 设置场景服务,本项目单窗口 tab 场景不移植。

## 四、验证

- 用户手动启动 dev,打开 pi 会话实测:边框连成实线,暗点消失(2026-11-23 用户确认)。
- `pnpm typecheck` 0 error;`pnpm test` 205 passed / 31 files。

## 五、遗留关联

- 与「右侧空白带」(2026-11-21 文档)无因果:本修复不改变 fit/预留几何,webgl 的 cell 度量与 canvas 度量同源。
- `docs/pending-verification.md` 二之二中「第二台机器复验」条目仍开放,与本题无关。
