# 待验证清单(用户手动)

> 2026-11-21 建立 | 状态:待验证
> 用途:开发期由 AI 完成但**本机不可自动验证**或**需要人工确认体验**的条目,逐条勾选。
> 每条都写明「为什么没验」「怎么验」「验不过时的判定依据」——验证完在 `[ ]` 打 `x` 并附日期。

## 一、T11 打磨与打包(2026-11-21 实现完成,待安装验证)

环境:安装包 `dist/Soloport-0.1.0-setup.exe`(120MB,electron-builder NSIS,未签名 → Windows 可能弹「未知发布者」,属预期)。

- [ ] **1. 安装与启动**
      验:双击安装 → 可选安装目录 → 桌面/开始菜单出现「Soloport」→ 启动出窗口。
      预期:窗口标题栏单行(左栏开关 + Soloport + 主题/面板按钮 + 系统按钮),无白屏,无报错弹窗。

- [ ] **2. 数据迁移**
      验:首次启动后看左栏项目与会话;并核对 `%APPDATA%/Soloport/store.json` 存在、`%APPDATA%/agent-sessions/store.json` 仍在。
      预期:原有 1 个项目(含 28 条会话)照常出现;旧目录文件保留未删(设计:复制不搬移)。
      依据:`src/main/store-migration.ts` 三条单测已覆盖复制/不覆盖/不动手,但真实 %APPDATA% 路径只在这里验。

- [ ] **3. 打包版 PTY 可用(重点)**
      验:新建一个 pi 会话 → 终端出现 cmd 提示符 → 能输入命令 → 能跑起 pi。
      为什么没自动验:`electron-builder.yml` 设了 `npmRebuild: false`(node-pty 用自带 N-API 预编译),只证明到「主进程能启动」,spawn/ConPTY 路径没验。

- [ ] **4. 主题三态**
      验:点标题栏主题按钮循环 系统 → 浅色 → 深色;重启应用看是否保持;系统切深浅色时「系统」档是否跟随。
      预期:界面与窗口右上角系统按钮配色同时变;重启后保持上次选择;无首帧白闪(强制深色时)。

- [ ] **5. 快捷键**
      验:`Ctrl+B` 左栏、`Ctrl+Shift+E` 文件面板、`Ctrl+Shift+G` Git 面板、`Ctrl+N` 新建会话菜单、`Ctrl+Tab`/`Ctrl+Shift+Tab` 切标签、`Ctrl+W` 关当前标签。
      关键反例:**终端聚焦时按 `Ctrl+W` 应只删除前一个词,不得关闭标签/杀进程**;`Ctrl+B/N/E` 在终端里应是 shell 行为。
      依据:守卫逻辑在 `src/renderer/src/App.tsx`(终态判据 `closest('.xterm')`),无单测(需真实 xterm 焦点)。

- [ ] **6. 等输入通知**
      验:开两个会话,让其中一个在**后台**进入等输入(如 pi 的阻塞对话框;claude/codex 的确认菜单)→ 应弹出系统通知「会话在等你输入」→ 点击通知 → 窗口恢复并切到该标签页。
      预期补充:前台会话等输入时**不**弹;`working`/`exited` 不弹。
      为什么没自动验:Windows 通知要求安装后的快捷方式 AUMID(`com.soloport.app`)匹配,直接跑 `dist/win-unpacked/Soloport.exe` 通常不弹或分组合并。
      注:判定规则本身有 4 条单测(`src/main/notify.test.ts`),这里验的是「真实系统通知 + 点击聚焦」。

- [ ] **7. 应用图标**
      验:桌面快捷方式、任务栏、开始菜单图标。
      现状:仍是 Electron 模板占位图标(`resources/icon.png`)。换图后需重跑 `pnpm build:win` 重新出包。

## 二、跨任务遗留:本机未安装的 agent(整特性终审口径)

本机只装了 pi,其余四家的验证均以构造/移植样本代替。装好后需复核:

- [ ] **8. claude / codex**
      T6 导入与 T8 续接:`claude --resume <id>`、`codex resume <id>` 在本机真实安装下可用;导入能读到真实 jsonl/rollout。
      参考:T6 开发记录「未验证/本机不可达」、T8 记录。
- [ ] **9. kimi / antigravity**
      T7 导入路径与记录形状(`<home>/.kimi-code/sessions/.../state.json` + 索引配对键带 `session_` 前缀;antigravity `transcript_full` 是否总比 `transcript` 新);T10 分支名/状态规则。
      参考:T7 开发记录「未验证/本机不可达」。
- [ ] **10. 状态点识别(其余四家)**
      T5 规定 claude/codex/antigravity 的屏幕/标题规则来自 Orca 锚点推算,装后按真实界面校准。

## 三、已知边界(不算缺陷,记录备查)

- 未跟踪的新文件在 Git 面板点开没有 diff(显示「暂存后可见差异」):`git diff HEAD` 对未跟踪文件为空。
- 草稿级 diff 着色:正文行首恰为 `---`/`+++`(如 YAML/SQL 注释)会丢增删底色,文本本身正确。
- 回填轮询:并发第二会话若标签页一直开着不会自动接棒;关闭后重开走全新对话(防串线优先于自动续接)。
- 空仓库(未提交过):Git 面板分支下拉为空、提交按钮禁用;取消暂存走 `git rm -f --cached`。
- 应用未签名:安装包无代码签名,Windows SmartScreen 会提示「未知发布者」。
