# 终端渲染遗留问题:pi(TUI)右侧空白带与滚动条错位

> 2026-11-21 04:43 | 状态:**已定位并修复** | 根因:字体度量不一致(xterm canvas 8px/格,DOM 文本 7px/格);详见第六节

## 一、现象(用户口径)

pi(TUI agent)在应用内运行时:

1. **终端右侧存在空白带**:pi 的界面内容(分隔线、状态栏)结束位置早于终端右缘,右侧留出一条空隙
2. **滚动条错位**:pi 自绘的滚动条(散落的白色竖线段)悬在内容右缘内侧,与内容边界不齐
3. 窗口最大化/缩放后,pi 界面**不跟随重排**(内容仍是旧宽度,空白恒定存在)
4. 已知正常:shell(pi 退出后)滚动正常;滚轮在 pi 内已可用(见「已修复」节)

用户明确的处置意见:**不接受现有方案,要求重新讨论解决方案**(下一会话处理)。

## 二、已修复且验证有效的部分(不要回退)

| 项 | 结论 | 证据 |
|---|---|---|
| 滚轮在 pi 内可用 | ✅ 已通 | 采样字节流出现 `?1000h/?1002h/?1003h/?1006h`(鼠标模式透传成功);用户实测可滚 |
| ConPTY 透传鼠标模式 | ✅ 根因=缺 `useConptyDll` | 移植 Orca `native-pty-spawn.ts:91`;采样前后对比(无 → 有鼠标 DECSET) |
| xterm 版本 | ✅ 6.1.0-beta.336(对齐 Orca) | package.json |
| 布局层对齐 Orca | ✅ 已落地 | terminal.css 的 `.xterm-container`(calc+4px margin+contain:paint)、`.xterm` 100% 铺满、`scrollbar:{width:7}`、scrollSensitivity 1.15、scrollbar-sleek 样式 |
| DOM 几何对齐 | ✅ 实测无溢出 | container=351px、.xterm=351px、viewport=351px、screen=344px(-7px=滚动条预留) |
| 应用整体不再出滚动条 | ✅ 已修 | App.tsx `overflow-hidden` + main/aside/TerminalTabs 补 `min-h-0` |
| spawn 初始尺寸=真实 fit 提案 | ✅ 已实现(Fix-A/B) | `resolvePtyFirstSize` + 渲染层「先开 tab → fit → 带 cols/rows spawn」;单测 + mutation check 覆盖 |

## 三、实证数据(下一会话直接复用,无需重跑)

### 3.1 链路逐段实测结论

| 环节 | 结论 | 实测方式 |
|---|---|---|
| xterm 列数重算 | ✅ 正常 | Playwright CDP:收起右栏 → main 1008→1296、container→1288、screen→1280 |
| resize IPC | ✅ 正常 | 主进程日志与渲染层回调逐条一致(43×38 / 79×36 / 160×46 / 124×49) |
| ConPTY 缓冲更新 | ✅ 正常 | 动态 resize 80→160 后 `mode con` 报「列: 160」 |
| **pi 感知运行期 resize** | ❌ **不通** | pi 是 node 应用,依赖 `process.stdout` resize 事件;Windows ConPTY 下该事件不触发(nodejs/node#13197 缺陷域)。pi 的 TUI 源码无 resize 监听,渲染用启动时的 `terminal.columns/rows` |
| spawn 尺寸传递 | ✅ 正常 | 独立 PTY 探针 `cols=43, rows=38` → pi 渲染出 **38 行**(rows 未错位) |

### 3.2 仍无法解释的残差(核心待查)

**即使 spawn 时 cols 正确**,pi 的界面内容仍比终端宽度窄约 5-6 列,且那一带出现白色竖线段(疑似滚动条)。

可疑方向(未验证):

- **H1:xterm 6.1-beta 的 viewport/scrollbar 与 TUI 重绘不同步**。Orca 为此**给 xterm 打上游补丁**(`config/patches/xterm-src/@xterm__xterm@6.1.0-beta.336.src.patch`):Viewport 段在 cell 未测量时让 scrollLines/scrollToLine 走 buffer 通路、`_sync` 与滚轮回调拒绝用 NaN 毒化 `ydisp`、置 `_needsSyncOnRender` 延迟重写滚动条;RenderDebouncer 段防刷新回调重入死循环。**我们未移植该补丁**。
- **H2:双滚动条并存**。xterm 6 内建自绘滚动条(7px 预留,实测 screen 比 xterm 窄 7px)+ pi 自绘的 TUI 滚动条(`getScrollbarGeometry`/`handleScrollbarMouseEvent`,画在它的 `terminal.columns-1` 列)同时存在,视觉上就是「散落竖线段 + 内容右缘不齐」。
- **H3:pi 自绘滚动条本身占列**,导致内容末列留白,与 xterm 的滚动条槽叠加成空白带。

### 3.3 关键证据文件(scratch 目录,可能已被清理,重跑脚本见下)

- 采样脚本模式:`AGENT_SESSIONS_SAMPLE=<dir> pnpm dev`,样本落 `<dir>/<sessionId>.bin`
- ConPTY DA1 代答(探针必须):`\x1b[?61;4c`(Orca `CONPTY_DA1_RESPONSE`);不代答则 ConPTY 1.23 启动停 3s
- DOM 探针:Playwright `connectOverCDP('http://127.0.0.1:19999')` → `pnpm dev -- --remote-debugging-port=19999`

## 四、Orca 侧可继续挖的点(调研报告 Q4/Q5 已给坐标)

1. `config/patches/xterm-src/@xterm__xterm@6.1.0-beta.336.src.patch` — Viewport + RenderDebouncer 两段(与我们的 xterm 版本完全相同)
2. `src/renderer/src/lib/pane-manager/terminal-scroll/`(`pane-scroll.ts`、`pane-scroll-snapshot.ts`、`terminal-scroll-buffer-snapshot.ts`) — 滚动条与滚动意图的治理
3. Orca pane 的 `xterm-container` 结构与我们是否完全等价(Orca 还有 `.pane > .pane-drag-handle` 等兄弟节点与 `contain: paint`)
4. Orca 的 `pane-terminal-options.ts` 是否还有 `overviewRulerWidth`/`scrollbar` 之外的样式项影响末列

## 五、工作区状态(交接用)

- T3.5 全部改动**未提交**(工作区):shell 底座(ADR-0004)、孤儿树杀、滚轮四分支、ConPTY 透传、StableCellFitAddon、terminal.css/scrollbar-sleek.css、布局 min-h-0 修复、spawn 尺寸精确化(Fix-A/B)
- `pnpm typecheck` 0 error;`pnpm test` **75 passed / 10 files**
- 已提交的历史停在 T3 记账:`cdf54d1a`
- 问题记录时间:2026-11-21

## 六、最终定位与修复(2026-11-21 04:43)

- **根因**:当前 Terminal 使用 xterm 默认 `fontFamily: 'monospace'`，xterm 用于测量网格的 canvas 与 DOM renderer 实际渲染回退到不同字体度量。现场定量：122 列时每行最后一个字符只推进到屏幕约 88%，即网格按 8px/格计算而文本按 7px/格推进；右侧空白随列数线性增长，所以看起来是“固定大小的一条空白”。
- **排除项**:不是 PowerShell/cmd 差异，不是旧 pi 进程保留启动列数，不是 H1/H2/H3 单独造成。退出 pi 后重新运行仍复现，是因为同一字体度量问题对每次新进程都成立。
- **与 Orca 的差异**:Orca `pane-terminal-options.ts` 显式设置完整字体族、`fontSize: 14`、`fontWeight: '300'`、`fontWeightBold: '500'`，canvas 测量与 DOM 渲染使用同一字体；当前项目此前只使用 xterm 默认值。
- **修复**:`src/renderer/src/components/terminal/use-terminal.ts` 按 Orca 同款常量设置字体族、字号与字重，并新增回归测试校验 Terminal 选项。
- **验证**:真实窗口放大到 122 列后，分隔线最后一个字符的 Range 右缘与 `screen.width / cols` 一致（约 8.2px/格），空白只剩 pi 自绘滚动条 1 列与 xterm 7px 沟槽；`pnpm typecheck` 0 error，`pnpm test` 76 passed / 10 files。

## 七、后续主题/终端配置约束

- **单一来源**:`fontFamily` / `fontSize` / `fontWeight` / `fontWeightBold` 必须作为 `Terminal` 配置项传入或运行时更新，不得只改 `.xterm-rows` 的 CSS。canvas 测量和 DOM renderer 必须使用同一套字体度量，否则右侧空白带会复现。
- **颜色可独立更新**:`foreground`、`background`、`cursor`、`selection`、`scrollbarSlider*` 等颜色不影响几何，可通过 `terminal.options.theme` 运行时更新，无需 refit。
- **度量类配置要 refit**:字体、字号、字重、滚动条宽度变化会改变 cell 宽高或 cols/rows；更新 option 后必须对所有终端 `fitAddon.fit()`，并让现有 `onResize → pty.resize` 链路同步 PTY 网格。
- **继续复用 `StableCellFitAddon`**:它用 device/dpr cell 尺寸让提案成为盒子的纯函数；不要退回裸用 `FitAddon.proposeDimensions()`。
- **scrollback 保持创建期参数**:当前 `TerminalView` 在 `scrollback` 变化时重建实例，语义简单，可保留；字体、颜色、滚动条宽度适合运行时更新，不必重建 terminal。
- **建议结构**:抽 `resolveTerminalAppearance(settings)` 统一产出字体、字号、字重、颜色、scrollbar 配置；构造 `Terminal` 和设置变更都走它，仅在度量类配置变化后触发 refit。若要更稳，可再参考 Orca 的 metric deferral，等字体和布局可测量后再应用几何变化。
