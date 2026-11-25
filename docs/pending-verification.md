# 待验证清单(用户手动)

> 2026-11-21 建立 | 状态:待验证
> 用途:开发期由 AI 完成但**本机不可自动验证**或**需要人工确认体验**的条目,逐条勾选。
> 每条都写明「为什么没验」「怎么验」「验不过时的判定依据」——验证完在 `[ ]` 打 `x` 并附日期。

## 一、T11 打磨与打包(2026-11-21 实现完成,待安装验证)

环境:安装包 `dist/Soloport-0.1.0-setup.exe`(120MB,electron-builder NSIS,未签名 → Windows 可能弹「未知发布者」,属预期)。

- [x] **1. 安装与启动**(2026-11-25 通过)
      验:双击安装 → 可选安装目录 → 桌面/开始菜单出现「Soloport」→ 启动出窗口。
      预期:窗口标题栏单行(左栏开关 + Soloport + 主题/面板按钮 + 系统按钮),无白屏,无报错弹窗。

- [x] **2. 数据迁移**(2026-11-25 通过)
      验:首次启动后看左栏项目与会话;并核对 `%APPDATA%/Soloport/store.json` 存在、`%APPDATA%/agent-sessions/store.json` 仍在。
      预期:原有 1 个项目(含 28 条会话)照常出现;旧目录文件保留未删(设计:复制不搬移)。
      依据:`src/main/store-migration.ts` 三条单测已覆盖复制/不覆盖/不动手,但真实 %APPDATA% 路径只在这里验。

- [x] **3. 打包版 PTY 可用(重点)**(2026-11-25 通过)
      验:新建一个 pi 会话 → 终端出现 cmd 提示符 → 能输入命令 → 能跑起 pi。
      为什么没自动验:`electron-builder.yml` 设了 `npmRebuild: false`(node-pty 用自带 N-API 预编译),只证明到「主进程能启动」,spawn/ConPTY 路径没验。

- [x] **4. 主题三态**(2026-11-25 通过)
      验:点标题栏主题按钮循环 系统 → 浅色 → 深色;重启应用看是否保持;系统切深浅色时「系统」档是否跟随。
      预期:界面与窗口右上角系统按钮配色同时变;重启后保持上次选择;无首帧白闪(强制深色时)。

- [x] **5. 快捷键**(2026-11-25 通过)
      验:`Ctrl+B` 左栏、`Ctrl+Shift+E` 文件面板、`Ctrl+Shift+G` Git 面板、`Ctrl+N` 新建会话菜单、`Ctrl+Tab`/`Ctrl+Shift+Tab` 切标签、`Ctrl+W` 关当前标签。
      关键反例:**终端聚焦时按 `Ctrl+W` 应只删除前一个词,不得关闭标签/杀进程**;`Ctrl+B/N/E` 在终端里应是 shell 行为。
      依据:守卫逻辑在 `src/renderer/src/App.tsx`(终态判据 `closest('.xterm')`),无单测(需真实 xterm 焦点)。

- [x] **6. 等输入通知**(2026-11-25 通过)
      验:开两个会话,让其中一个在**后台**进入等输入(如 pi 的阻塞对话框;claude/codex 的确认菜单)→ 应弹出系统通知「会话在等你输入」→ 点击通知 → 窗口恢复并切到该标签页。
      预期补充:前台会话等输入时**不**弹;`working`/`exited` 不弹。
      为什么没自动验:Windows 通知要求安装后的快捷方式 AUMID(`com.soloport.app`)匹配,直接跑 `dist/win-unpacked/Soloport.exe` 通常不弹或分组合并。
      注:判定规则本身有 4 条单测(`src/main/notify.test.ts`),这里验的是「真实系统通知 + 点击聚焦」。

- [x] **7. 应用图标**(2026-11-25 通过)
      验:桌面快捷方式、任务栏、开始菜单图标。
      现状:仍是 Electron 模板占位图标(`resources/icon.png`)。换图后需重跑 `pnpm build:win` 重新出包。

## 一之二、终端 shell 换成 PowerShell(2026-11-22 实现,待验证)

背景:原 shell 底座是 cmd.exe(ADR-0004),现默认改为 **Windows PowerShell 5.1**;`settings.shell` 可切换
`cmd | powershell | pwsh`(改 `%APPDATA%/Soloport/store.json` 的 `settings.shell` 即可,新建会话时生效,
无需改代码;`pwsh` 需另装 PowerShell 7)。

- [x] **1p. 基本可用**(2026-11-25 通过)
      验:新建会话 → 终端里应是 PowerShell 提示符(`PS D:\...>`),而不是 cmd 的 `D:\...>`。
      依据:实现用 `powershell.exe -NoLogo -NoExit -Command "<chcp 65001 + UTF8 + & 'agent' 'args'>"`;
      本机已用 node-pty 探针验证「agent 跑起来 / 含空格参数完整 / 退出后提示符仍在」三项全绿。

- [x] **2p. pi 在 PowerShell 底座下正常**(2026-11-25 通过)
      验:pi 起得来、界面正常、能对话;/quit 退出后回 PowerShell 提示符,还能继续敲命令;再次进入 pi 正常。
      风险点:PS 5.1 对原生命令的参数引号有已知缺陷(引号内嵌/结尾反斜杠),pi 的 --session <转录路径> 是主要考验。

- [x] **3p. 续接(带空格路径)**(2026-11-25 通过)
      验:重开一个已回填/导入的会话 → pi 用 --session "<转录路径>" 续接成功。
      注意:本机家目录无空格,若想压测,可在含空格的目录下建会话。

- [x] **4p. 中文与编码**(2026-11-25 通过)
      验:终端里中文输入/输出不乱码;chcp 为 65001。
      依据:启动脚本已 chcp 65001 + 设 [Console]::OutputEncoding。

- [x] **5p. 快捷键在 PowerShell 下不冲突**(2026-11-25 通过)
      验:终端内 Ctrl+W/B/E/N 仍是 PSReadLine 的行编辑行为(不触发应用快捷键);Ctrl+Tab 仍能切标签。
      依据:守卫按 closest('.xterm') 判断,与 shell 种类无关。

- [ ] **改回 cmd**
      验(可选):把 store.json 的 settings.shell 改成 "cmd" → 新建会话回到 cmd 底座。
      注意:已开的会话不受影响(shell 只对新会话生效)。

## 二、跨任务遗留:本机未安装的 agent(整特性终审口径)

本机只装了 pi,其余四家的验证均以构造/移植样本代替。装好后需复核:

- [ ] **8. claude / codex**
      T6 导入与 T8 续接:`claude --resume <id>`、`codex resume <id>` 在本机真实安装下可用;导入能读到真实 jsonl/rollout。
      参考:T6 开发记录「未验证/本机不可达」、T8 记录。
- [ ] **9. kimi / antigravity**
      T7 导入路径与记录形状(`<home>/.kimi-code/sessions/.../state.json` + 索引配对键带 `session_` 前缀;antigravity `transcript_full` 是否总比 `transcript` 新);T10 分支名/状态规则。
      参考:T7 开发记录「未验证/本机不可达」。
- [x] **10. 状态点识别(其余四家)**(2026-11-25 结账:读屏校准已随 ADR-0007 退役,装后复核由 H6 承接)
      原「屏幕/标题规则装后按真实界面校准」作废——读屏三源已退役(ADR-0007);四家装后复核对象 = hook 事件映射与注入正确性,见 H6。

## 二之二、终端右缘滚动条(2026-11-22 修复,待肉眼复核)

- [x] **已修:右缘「双滚动条 + 10px 死带」** —— 根因:viewport 的原生滚动条(实测占 10px)与 xterm 自绘条(7px)叠加,而 fit 只预留 7px。修复:CSS 隐藏原生条(scrollbar-width:none + webkit-scrollbar display:none),保留 xterm 自绘 7px 条(hover/滚动显形)。CDP 复测:原生沟槽 10→0,viewport 654=654 无死带,无横向溢出。
- [x] **肉眼复核(需要你)**(2026-11-25 通过):滚动长内容时右缘应只剩一根细条(滚轮滚动时短暂显形),表格右框线不再被压;若你想要「常显」的滚动条而不是滚动时才出现,告诉我再调。
- [ ] **未解决(2026-11-22 用户复核:问题依然存在)** —— CSS 隐藏原生条后,CDP 几何上原生沟槽已为 0、无横向溢出,但用户看到的右缘观感未改善。**说明「不完美」的主体不是 viewport 原生条**,剩余嫌疑:
      a) xterm 自绘条(`.xterm-vertical`,7px,滚动时显形)与 pi 自绘滚动条列(内容 1 列)紧贴,两根「条」视觉上仍并排;
      b) `scrollbar: { width: 7 }` 的预留与 pi 实际绘制宽度之间可能有 1px 级错位(表格右框线被压的候选根因);
      c) `.xterm-container` 的 4px margin + `contain: paint` 让右缘视觉上被裁。
      下一步(按 T3.5 方法论,先量化再改):在滚动状态下用 CDP 量「`.xterm-scrollbar` 的 x/right、pi 滚动条列所在 cell 的列号×cell 宽、表格右边框所在列的右缘」,三者对齐关系出来才能定位是哪一层的 1px;修法候选 = 调 `scrollbar.width` 预留值 / 让 pi 侧少画 1 列(不可控)/ 去 margin。
      注:本轮 CSS 修复(隐藏原生条)保留——它消除了三层叠加中确定的一层,方向没错但不够。
- [x] **新进展(2026-11-23 01:37;2026-11-25 第二台机器复验通过)** —— 本机 node_modules 损坏缺 `node-pty`/`@xterm`(应用起不来),`pnpm install` 重装后干净启动,**用户复核右缘观感「很完美」**。CDP 量化(DPR 1,容器 1672px):viewport offsetWidth=clientWidth=1672(原生条 0),screen 1657,残差 15px = 7px 自绘条沟槽 + 约 8px 取整余数(≈1 格,向下取整固有)。**用户说明:应用在两台机器上运行**——11-22 的「依然存在」复核与本日的「完美」可能分属两机。第二台机器复验前的头号差异变量:字体安装情况(回退链落到不同字体 → canvas/DOM 度量不一致复现)、DPI 缩放(本机 DPR 1,修复时的量化在 DPR 1.25)、GPU/渲染路径。若第二台机器复现:先按上述变量逐项对照两机,再回到滚动状态量化(上一条的 a/b/c)。

## 二之三、终端 emoji 宽度错位(2026-11-23 修复,待肉眼确认)

- [x] **已修:含 emoji 的行整体左移一格、右边框错位** —— 根因:xterm 内置宽度表只有 Unicode 6(`✅`/`❌` 宽度算 1),而 agent CLI 按 Unicode 9+ 排版(emoji 算 2 格)。修复:装 `@xterm/addon-unicode11@0.10.0-beta.330`、Terminal 开 `allowProposedApi`、open 后激活 `unicode.activeVersion = '11'`。证据:探针 `before ✅=1` → `after ✅=2`(中文/ASCII 不变);单测 + mutation check;31 文件 / 206 用例绿。详见 `docs/issues/2026-11-23-emoji-wide-char-misalignment.md`
- [x] **肉眼复核(需要你)**(2026-11-25 通过):`pnpm dev` 打开含 `✅`/`❌` 的表格行,该行右边框应与上下行对齐、不再左移一格
- [x] **已修:WebGL context loss 无回退** —— addon 在 context loss 时只 fire `onContextLoss`、不自 dispose(源码确认),我们原先未订阅,GPU 上下文丢失后终端会空白/冻结不恢复。修复:订阅后 `webglAddon.dispose()`,dispose 内部 `setRenderer(DOM)` 自动回退。回归用例 + mutation check 通过。详见 `docs/issues/2026-11-23-terminal-addon-audit.md`
- [ ] **运行时确认(需要你,非必须)**:如遇 GPU 上下文丢失场景(远程桌面切换/休眠唤醒),终端应回退 DOM 继续绘制;可用 DevTools 注入 `WEBGL_lose_context` 模拟

## 三、已知边界(不算缺陷,记录备查)

- 未跟踪的新文件在 Git 面板点开没有 diff(显示「暂存后可见差异」):`git diff HEAD` 对未跟踪文件为空。
- 草稿级 diff 着色:正文行首恰为 `---`/`+++`(如 YAML/SQL 注释)会丢增删底色,文本本身正确。
- 回填轮询:并发第二会话若标签页一直开着不会自动接棒;关闭后重开走全新对话(防串线优先于自动续接)。
- 空仓库(未提交过):Git 面板分支下拉为空、提交按钮禁用;取消暂存走 `git rm -f --cached`。
- 应用未签名:安装包无代码签名,Windows SmartScreen 会提示「未知发布者」。

## 四、hook 状态通道(2026-11-24 实现,待实机验证)

特性:docs/plans/2026-11-23-hook-run-state/(ADR-0007)。状态识别改走 agent 官方 hooks,读屏三源退役。本机可测 claude(2.1.220)/pi(1.6.0)。

- [ ] **H1. claude 状态全环**
      验:新建 claude 会话 → 提交提示 → spinner 转;回答完成 → 消失且后台会话弹「任务已完成」通知(working→idle,2026-11-24 增补);权限对话框 → spinner 变橙(waiting)且后台会话弹「会话在等你输入」通知。
      边界:首次在项目目录跑 claude 会弹信任对话框(交互模式,接受后生效);未信任前无状态属 claude 侧行为。
- [ ] **H2. pi 状态全环**
      验:pi 会话提交 → spinner 转;/quit 回 shell → 消失;扩展对话框 → waiting。首跑弹项目信任(pi 自己的对话框),接受后扩展才被加载——首个会话可能无状态,重开生效。
- [ ] **H3. 回归双反例(原 Bug 1/2 场景)**
      验:working 中切到另一标签再切回,spinner 全程正确;无回合时在终端打字,spinner 不亮。
- [ ] **H4. 注入文件与用户配置共存**
      验:项目目录出现 .claude/settings.json(或已有文件被合并);含用户自有 hooks 的,注入后保留;项目删除后 managed 条目摘除(pi 扩展文件删除)。
- [ ] **H5. 显式移除**
      验:`window.api.hooks.remove()`(控制台直调)后各项目配置摘净;重启应用 reconcile 又写回。
- [ ] **H6. 未装三家装后复核**
      验:装 codex/kimi/antigravity 后——注入生效(codex 需 repo trust;antigravity hooks.json 形状;kimi 全局 config.toml marker)、事件映射正确、env 令牌继承(转发脚本 POST 带 sessionId)。

## 五、会话名随回填自动更新(2026-11-24 实现,待实机验证)

特性:新建会话初始名 = agent 显示名(如「Pi」);回填拿到 externalSessionId 后,把 agent 侧标题(通常为首条用户提示截断)写回会话名,侧栏即时刷新。pi 这类启动即建文件的 agent 由「标题补捞」接力(最长 2 分钟);用户手动改名过的会话永不覆盖。

- [ ] **R1. claude 会话名自动更新**
      验:新建 claude 会话(初始名「Claude Code」)→ 发一条消息 → 侧栏该会话名自动变为消息摘要(截断 96 字符)。
      边界:claude 项目首次会话需先过信任对话框;未信任时无 hook 无回填。
- [ ] **R2. pi 会话名自动更新(标题补捞)**
      验:新建 pi 会话(初始名「Pi」)→ 发一条消息 → 数秒内(节流档 750ms/2s/3s/15s)侧栏名自动变为消息摘要。
      为什么可能慢:补捞轮询沿用回填节流,首条消息若在补捞超时(2 分钟)后才发,则标题保持「Pi」属预期。
- [ ] **R3. 用户改名不被覆盖**
      验:新建会话后立即双击改名(如「我的会话」)→ 发消息 → 会话名保持「我的会话」不变。
      边界:把会话名改回与 agent 显示名完全相同(如「Pi」)会被回填标题覆盖,已知极罕见边界。
- [ ] **R4. 回填失败时保持初始名**
      验:同一 agent + 项目并发开第二个会话(无待回填资格)→ 重开原样拉起,会话名保持 agent 显示名,无异常。
