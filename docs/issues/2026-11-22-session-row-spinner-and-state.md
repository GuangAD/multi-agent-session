# 侧栏会话行 spinner 与运行状态判定遗留问题

> 2026-11-22 | 状态:**待修(用户逐个处理中)** | 来源:侧栏会话行视觉整理特性门 3 后的用户实机反馈
>
> 本文件记录五个独立 bug。用户明确指示:**先记录、后续逐个修,当前继续找 bug**。本轮不改代码。截图存 `docs/issues/assets/`。

## 背景

侧栏会话行视觉整理特性(brief `docs/plans/2026-11-22-sidebar-session-row-polish/`)把行尾常驻状态点删除,改为仅在 `working` 态显示行首 spinner。这一改动把既有状态引擎与终端渲染的深层行为暴露出来——用户实机反馈五个问题,均在门 3 后提出;其中 Bug 4-5 为 pi CLI 特有、用户明确不排查,仅归档。

---

## Bug 1:切换标签后 working 动画消失

**现象**(用户口径):开两个会话,A 在工作(spinner 转),切到 B 后 A 的 spinner 消失;点回 A 才恢复。用户期望:只要 agent 仍 working,无论标签是否激活,侧栏 spinner 保持。

**根因(已用实机 DBG 日志定位)**:隐藏标签页(`display:none`)的 xterm 画面塌缩成 1-2 个空白字符(len=1/2;真实工作画面 len=1800+)。状态引擎 `onSnapshot` 原样处理这种伪快照:`byteBuffer=''` 清掉字节地标证据 + `markActivity()` 刷新活动时间 → 安静门槛后误判 idle → spinner 消失。切回时 `fit()` 重绘恢复画面(len=1874)→ 判回 working。

**日志证据**(用户 2026-11-22 实测,已移除临时日志):
- 切 B @18459 → A 快照 `len=1` @18734 → A `-> idle` @19044
- 切回 A @20162 → A 快照 `len=1905` @20449 → A `-> working` @35377
- 第二轮同样模式(切 B → len=1 → idle;切回 → len=1874 → working)

**已做部分修复(commit `0da1fd56`)**:`state-parser.ts` 的 `onSnapshot` 加守卫 `if (visibleText.length <= 2 && visibleText.trim() === '') return`,忽略极短空白塌缩快照;回归用例 14/15 + 两轮 mutation 验证通过。

**为何仍有问题**:部分修复只堵了「空白快照」这一条噪声源。用户后续反馈「切换会话还是会有问题」「点击另一个会话后 loading 马上消失」——说明还有别的路径让状态在切换时变 idle。待查方向:
- 切走瞬间仍可能有真实字节/标题事件到达,触发 `onSnapshot` 的非空白塌缩画面(如日志里的 `len=78`),清空 byteBuffer
- `claude` 的 `title.working` 正则 `/[⠋-⣿]/` 不受安静门槛约束,但切走后标题事件是否变化需要重新取证
- 需要再次加 DBG 日志,确认这次「马上消失」的状态变化由哪个事件触发

**待修方向**:加临时日志复现「切走→马上消失」,定位触发事件;可能需要从渲染层源头阻止隐藏标签上报快照(而非引擎侧过滤),或引入「标签可见性」信号参与状态判定。

---

## Bug 2:CLI 未工作时在输入框输入内容也触发 loading

**现象**(用户口径):CLI 没有在工作时,在下方输入框中输入内容,也会触发 working spinner。

**根因(代码级已定位,未修)**:状态引擎把「PTY 有任何字节活动」等同于「agent 在工作」。链路:
```
用户输入 → terminal.onData(use-terminal.ts:232) → bridge.pty.write
  → ptyRegistry.write(id, data) → shell 回显
  → pty.onData(pty-registry.ts:337) → ipc/state.ts onData
  → tracker.onBytes(data) → markActivity() → working
```
- `kimi` 是 degraded 档(「有输出=working」),用户输入回显必然触发 working
- 其他档:输入回显重置 quiet 计时,若标题/屏幕地标恰好满足 working 规则也会续上

**证据**:`pty-registry.ts:369` `pty.write(id, data)` 与 `:337` `pty.onData` 同通道;代码注释 `:37` 明说「写入 shell,与用户键入同通道」。既有 fixture 用例 7/8(kimi output-working / quiet-idle)钉住「有输出即 working」的语义。

**待修方向**:这是状态引擎的**设计级缺陷**——需区分「agent 输出」与「用户输入回显」。可能方案:
- 主进程在 `pty.write` 侧标记用户输入的时间窗,窗口内的 `onData` 字节不作为 working 证据
- 或渲染层输入时暂停向状态引擎上报
- 会触及五家 agent 的 fixture 回放与判定语义,需重新过门 1(brief 级设计变更)

---

## Bug 3:切回会话时终端黑屏,需等一会才显示内容

**现象**(用户口径):切到另一个会话再切回时,终端区域黑屏,需要等一会才显示终端内容。

**根因(静态定位,未取证)**:`TerminalView.tsx:44` 用 `style={{ display: active ? 'flex' : 'none' }}` 隐藏非激活终端。隐藏期间:
- `ResizeObserver` 注释明说隐藏容器不触发尺寸变化,`fit()` 自动跳过(`use-terminal.ts:44`)
- 切回时 `activateTerminal()`(`use-terminal.ts:334`)在 `requestAnimationFrame` 里做 `fit()` + `focus()`,需至少一帧才重绘
- xterm 在 `display:none` 期间不渲染,切回后到下一次 fit/refresh 之间的窗口就是黑屏

**证据**:`TerminalView.tsx:29-32` active effect 调 `activateTerminal`;`use-terminal.ts:339-345` RAF 内 fit+focus;数据泵仍对所有 tab 写 buffer,但隐藏标签不重绘。

**待修方向**:`activateTerminal` 里在 fit 后立即 `terminal.refresh(0, terminal.rows - 1)` 强制重绘,消除黑屏窗口;验证需实机切换观察。属渲染层局部修复,风险低。

---

## Bug 4:pi 会话内长行文字超出右边界 [pi 特有,不排查]

**现象**(用户截图):pi 会话终端内,一行文字(「切换回来时,终端黑屏,需要等一会才会显示内容」)明显超过终端最大宽度,延伸到右侧滚动条处被截断;相邻行长度相近却正常。

**截图**:`docs/issues/assets/spinner-and-state-text-overflow.png`(红框标注溢出行)

**用户判定**:**只在 pi 中试过,PowerShell 中未遇到,不要找 pi 的问题**。即本条按「pi CLI 自身 TUI 渲染表现、非本应用缺陷」归档,不排查、不修。

**范围确认**:仅在 pi 会话观察到,其他 agent(claude/codex/kimi/antigravity)与纯 shell 未做对比;用户明确不要求排查 pi 侧。

---

## Bug 5:pi 会话内 read 命令路径文字带横线 [pi 特有,不排查]

**现象**(用户截图):pi 会话中 `read C:\Users\...\pi-clipboard-*.png` 命令行,路径文字上有一条贯穿横线(类似删除线样式)。

**截图**:`docs/issues/assets/pi-read-command-strikethrough.png`(红框标注横线文字)

**用户判定**:**只在 pi 中试过,PowerShell 中未遇到,不要找 pi 的问题**。同 Bug 4,按「pi CLI 自身渲染样式、非本应用缺陷」归档,不排查、不修。

**范围确认**:仅在 pi 会话观察到,其他 agent 未对比;用户明确不要求排查 pi 侧。

---

## 共同约束与验证入口

- Bug 1-3 发生在侧栏视觉整理特性之后,根因在既有状态引擎/终端渲染,非本次 UI 改动引入(改动只是让它们可见)
- Bug 4-5 为 pi CLI 特有渲染现象,PowerShell 不复现,按用户指示不排查、不修
- 状态引擎测试接缝:`src/main/agent-state/state-parser.test.ts`(15 用例,假时钟 + fixture 回放)
- 终端渲染接缝:`src/renderer/src/components/terminal/use-terminal.test.ts`
- 实机复现入口:`pnpm dev`,开两个会话切换 / 在输入框敲字观察行首 spinner
- 临时日志纪律:如需再取证,DBG- 前缀,复现后一律移除(上次已完整清理,三处文件零 diff)
- Bug 1 与 Bug 2 根因相关(字节流 ≠ agent 工作),可能需一起设计;Bug 3 独立

## 当前状态

用户仍在找 bug,可能追加更多问题。Bug 1-3 均**未修**(Bug 1 有部分缓解提交 `0da1fd56`,但症状仍在),待用户指定顺序后逐个修。Bug 4-5 为 pi 特有、用户明确不排查,仅归档。本文件随用户发现持续更新。
