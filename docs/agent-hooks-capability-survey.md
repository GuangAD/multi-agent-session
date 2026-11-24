# 五家 Agent CLI Hook 能力调研(状态识别用)

> 2026-11-23 | 性质:调研存档(非任务文档,不属于四层文档体系)
> 背景:评估「hook 通道做运行状态识别」的可行性。ADR-0001(2026-11-20)当年否决 hook 路线,依据是 Orca v1.4.265 快照里的 hook 子系统认知;本次逐家核对官方文档后,**其中三处事实已过时**,记录在此。本文不推翻 ADR-0001 的决策(现在仍不上 hook),但若将来立项,应以本文为基础写新 ADR 并标注与 0001 的取代关系。
> 调研方式:官方文档逐页核对(WebFetch 打开原文),不凭印象;本机实装状态单独标注。2026-11-23 二次核验:五家官方文档原文 curl 至 `.tmp/hook-docs/` 本地逐事件 grep,pi 另以本机 1.6.0 包内 docs/chunks/CHANGELOG 三重核对——修正首轮「WebFetch 小模型总结」这一不可靠证据层,全部事件名以原文命中为准。

## 一、总表

| | working→idle 边沿事件 | waiting(等输入)事件 | 项目级注入 | 失败行为 | 接入形态 |
|---|---|---|---|---|---|
| **claude**(本机 2.1.220) | `Stop`(回答完成)、`StopFailure` | `Notification`、`PermissionRequest` | ✅ `.claude/settings.json` / `.claude/settings.local.json` | 默认非阻塞警告;`onFailure: "block"`(v2.1.295+)可改 | settings 内 hooks 配置 → shell 命令 |
| **codex**(本机未装) | `Stop`(回合结束,`decision: "block"` 可续) | `PermissionRequest`(弹审批前) | ✅ `.codex/hooks.json`(repo 级,仅 trusted 层加载) | 观察类事件纯 advisory,超时/报错只报告不阻塞 | hooks.json(event → matcher → handler)→ command / mcp_tool |
| **kimi**(本机未装) | `Stop`、`TurnStarted`、`Interrupt` | `PermissionRequest` / `PermissionResult` | ❌ **仅全局** `~/.kimi-code/config.toml` `[[hooks]]` | fail-open:超时/崩溃一律放行 | config.toml 规则(event/matcher/command/timeout)→ shell 命令,上下文走 stdin JSON |
| **antigravity**(本机未装) | `Stop`(带 `fullyIdle` 字段) | **无专门事件**(没有「等待用户批准」钩子) | ✅ `.agents/hooks.json`(workspace 级);全局 `~/.gemini/config/hooks.json` | 阻塞是输出契约显式选择;脚本崩溃不自动阻塞 | hooks.json → 仅 `type: "command"`,stdin/stdout JSON |
| **pi**(本机 1.6.0) | `agent_settled`(权威 idle)、`agent_end`、`turn_start` / `turn_end` | `ui_prompt_start` / `ui_prompt_end`(仅扩展 `ctx.ui.*` 对话框,notification-only;0.85.0 起有) | ✅ `.pi/extensions/`(项目级,需 trust);全局 `~/.pi/agent/extensions/` | 进程内 TS 模块,异常即扩展自身问题,无「阻塞回合」歧义 | **TypeScript 扩展**(`pi.on(...)`),无 shell-command hook 形态 |

各家上下文载荷均含会话路由所需字段:claude/codex/kimi 的 stdin JSON 带 `session_id` + `cwd`;antigravity 带 `conversationId` + `workspacePaths` + `transcriptPath`;pi 经扩展 API 的 `ctx` 拿会话信息。**接收器按会话路由的前提成立。**

## 二、逐家要点

### claude(Hooks reference,官方文档已核对)

- 事件最全(30+),状态识别相关的:`Stop`(Claude 完成回答)、`StopFailure`(API 错误结束)、`Notification`(通知,含权限请求/空闲提醒)、`PermissionRequest`(工具需授权)、`SessionStart` / `SessionEnd`、`UserPromptSubmit`
- 配置位四级:用户级 `~/.claude/settings.json`、项目级 `.claude/settings.json`、项目本地 `.claude/settings.local.json`(不入库)、企业管理策略;另有 plugin hooks.json / skill frontmatter
- 失败语义:默认非阻塞(动作继续 + hook-error 提示);exit 2 在部分事件上有阻塞语义;`onFailure: "block"` 可显式升级(v2.1.295+)。**hook 失败不卡会话,指向死端口的代价 = 警告信息**

### codex(Hooks 官方文档,learn.chatgpt.com/docs/hooks)

- 14 个事件:状态识别相关的 `Stop`(回合结束)、`PermissionRequest`(「即将弹审批」)、`SessionStart` / `SessionEnd`、`UserPromptSubmit`、`Interrupt`;另有 `PreToolUse` / `PostToolUse` / `PreCompact` / `PostCompact` / `Pre/PostModelRequest` 等
- 发现路径:系统级 `/etc/codex/hooks.json`(Windows `%ProgramData%\OpenAI\Codex\hooks.json`)、用户级 `$CODEX_HOME/hooks.json`(缺省 `~/.codex/hooks.json`)、**仓库级 `.codex/hooks.json`(从项目根到 cwd 逐层查,仅 trusted 层加载)**;另有 config.toml 内联 `[hooks]`
- handler 支持 `command` 与 `mcp_tool` 两型,带 `timeout`(缺省 600s)、`async`、`commandWindows`
- 失败语义:SessionEnd / Interrupt / Pre/PostModelRequest 纯 advisory;`async` hook 永不阻塞
- 旧通道 `notify`(config.toml,仅 `agent-turn-complete` 一种事件)仍并存;hooks.json 与 config.toml 同时声明同一事件会双跑并在启动时告警

### kimi(Hooks 官方文档 + whats-new)

- 事件 18 个:状态识别相关的 `Stop`(回合完成)、`TurnStarted`(新回合开始,按 origin 匹配)、`Interrupt`(用户打断,替代 Stop,v0.14.0 起有)、`PermissionRequest` / `PermissionResult`(审批前后)、`SessionStart` / `SessionEnd`、`SessionHeartbeat`(存活会话每 60s 一发)
- 配置:**仅用户级 `~/.kimi-code/config.toml` 的 `[[hooks]]` 数组**(及本地插件)。文档明确不提供项目级 hook 文件,理由是防止仓库签出内容注入 hook 定义
- 规则四字段:`event`(必填)/ `matcher`(可选正则)/ `command`(必填)/ `timeout`(1-600s,缺省 30);多余字段会破坏配置加载
- 失败语义:exit 0 放行、exit 2 阻塞(stderr 为理由)、其余一律 fail-open 放行;官方自述「适合告警与轻量拦截,不应作为唯一安全屏障」
- 对本项目的含义:**唯一绕不开「写用户全局配置」的一家**,ADR-0001 的全局侵入顾虑被官方设计坐实

### antigravity(Hooks 官方文档)

- 事件 6 个:`SessionStart`、`PreToolUse`、`PostToolUse`、`PreInvocation`(模型调用前)、`PostInvocation`(模型调用后)、`Stop`(执行终止,载荷带 `fullyIdle` = 后台任务是否全部结束)
- **没有 waiting 专用事件**:无「等待用户批准/输入」钩子。waiting 态若要识别仍需屏幕规则(现有 `antigravity.json` 六条屏幕规则的职责不可替代)
- 配置位:workspace 级 `.agents/hooks.json`(项目根)、全局 `~/.gemini/config/hooks.json`、插件级;CLI 明确忽略 `~/.gemini/antigravity-cli/settings.json` 做 hooks
- handler 仅 `type: "command"`,stdin 收 JSON(`conversationId`/`workspacePaths`/`transcriptPath`/`modelName`/`lastUserInput` 等),stdout 回 JSON;`timeout` 缺省 30s
- Surface 差异:官方文档标注 App / CLI / IDE 扩展 / 独立 IDE 均支持;社区反馈(2026-08)称当前公开版本只有 `agy` CLI 实际执行 hooks,IDE 与桌面端不执行——本项目只跑 CLI,不受影响,留档备查

### pi(extensions 官方文档,本机 1.6.0)

- 形态与另四家不同:**TypeScript 扩展进程内运行**(jiti 直载 .ts,无需编译),不是 shell-command hook。扩展拿到 `ExtensionAPI`,用 `pi.on(<event>)` 订阅
- 状态识别相关事件:`agent_settled`(权威「pi 不会再继续」,即 idle 终点)、`agent_end`(单次 run 结束,重试/排队消息后可能还有续跑)、`turn_start` / `turn_end`(每回合)、`input`(用户输入到达)、`ui_prompt_start` / `ui_prompt_end`(**仅覆盖扩展经 `ctx.ui.select/confirm/input/editor/custom` 画的对话框,notification-only,0.85.0 起有**;pi 原生无逐工具授权对话框(T5 实证),一次性项目信任对话框走 `project_trust` 事件,可由我们的扩展订阅补上这个 waiting 场景)、`tool_execution_start` / `tool_execution_end`、`session_start` / `session_shutdown`
- 加载位:全局 `~/.pi/agent/extensions/*.ts|*/index.ts`;**项目级 `.pi/extensions/`(项目信任后才加载)**;settings.json 的 packages(npm/git);临时 `pi -e ./path.ts`
- 对本项目的含义:接入形态是「写一个 TS 扩展文件」而非「写 hook 配置」;扩展进程内全权限运行,接收上报要用 `pi.exec()` 或 Node 内置能力直连本地端口

## 三、相对 ADR-0001(2026-11-20)的三处事实更新

| ADR-0001 当年的依据(Orca 1.4.265 快照) | 2026-11-23 核实结果 |
|---|---|
| 「hook 的净收益只剩 kimi/antigravity 两家」(其余四家靠屏幕信号) | **codex 与 antigravity 都已有官方 hooks 系统**;五家全有事件机制 |
| 「hook 注入须写用户全局配置(kimi config.toml、pi 插件文件),影响应用外全部同类会话」 | **claude/codex/antigravity/pi 四家支持项目级注入**,影响面可收窄到本项目目录;仅 kimi 全局唯一(且官方明确拒绝项目级) |
| 「hook 失败可能影响用户会话」(隐含顾虑) | 各家核实均为非阻塞/fail-open:claude 默认警告、codex 观察类 advisory、kimi fail-open、antigravity 阻塞须显式输出契约。**死端口的最坏代价是警告,不卡会话**(pi 例外:扩展自身异常,无「阻塞回合」歧义) |

结论变化:**ADR-0001 的核心障碍(全局侵入)从「五家全中」收窄到「一家」**;「净收益只剩两家」的判断不再成立。决策本身(现阶段不上 hook)不受影响,但再评估时的输入已完全不同。

## 四、若将来立项,方案骨架(供门 1 讨论,未定案)

- 插件扩展点:每家插件声明 hook 注入模板(claude/codex/antigravity = 项目级配置文件写入;pi = 项目级 TS 扩展文件;kimi = 待定,全局 config.toml 违反侵入红线,倾向维持屏幕规则或征得用户明示同意)
- 本地接收器:复用现有 IPC/主进程 HTTP 短端口,hook 命令带短超时、失败静默(fail-open 与各家默认一致)
- 引擎接法:hook 事件作为第四源、最高优先级、事实直落(`publish()` 不去抖,同 `exited` 模式);屏幕三源引擎保留为兜底(antigravity 的 waiting、所有家的未覆盖场景仍靠它)
- 事件映射初稿:`Stop`/`agent_settled` → idle 终点;`TurnStarted`/`turn_start` → working 起点;`PermissionRequest`/`ui_prompt_start` → waiting;`SessionEnd`/`session_shutdown` → 进程级兜底
- 卸载语义:项目级 hook 配置属「静态无害、常驻」(只指向本地端口,不含会话状态),随应用卸载/项目移除清理,不做随会话清理(ADR-0001 的并发清理难题由此消解)

## 五、待核实项(不阻塞结论)

- codex 官方文档域为 learn.chatgpt.com(ChatGPT 站点子域),hooks.json 机制细节以该页为准;openai/codex GitHub 仓库内的对应文档未另行核对
- antigravity「IDE/桌面不执行 hooks、仅 agy CLI 执行」来自社区反馈,官方文档口径是全 surface 支持;本项目仅用 CLI,两说无差
- codex / kimi / agy 本机未安装:事件行为、payload 字段、失败语义均无法实测,接入前需装后复核
- claude `onFailure: "block"` 需 v2.1.295+;本机 2.1.220,该字段不可用(默认非阻塞行为不受影响)
- kimi 本机未装,`[[hooks]]` 实际版本要求未核(whats-new 显示 v0.14.0 起 Interrupt 存在)

## 六、来源

- Claude Code Hooks reference:https://code.claude.com/docs/en/hooks
- Codex Hooks(官方):https://learn.chatgpt.com/docs/hooks
- Kimi Code Hooks(官方):https://www.kimi.com/code/docs/en/kimi-code-cli/customization/hooks.html
- Kimi Code whats-new(Interrupt 事件):https://www.kimi.com/code/docs/en/kimi-code/whats-new.html
- Antigravity Hooks(官方):https://antigravity.google/docs/hooks
- Pi extensions 文档:https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/extensions.md
- 本机版本实测:`pi --version` = 1.6.0;`claude --version` = 2.1.220;codex/kimi/agy 命令不存在(PATH 探测 2026-11-23)
