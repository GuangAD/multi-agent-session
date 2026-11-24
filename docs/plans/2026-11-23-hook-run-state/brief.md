# Hook 驱动的运行状态识别 · 设计说明

> 2026-11-23 | 状态:草稿(待过门 1)
> 调研依据:[docs/agent-hooks-capability-survey.md](../../agent-hooks-capability-survey.md)(五家 hook 能力逐家核实);Orca 参考:`.reference` 快照 agent-hooks 子系统(kimi-hook-config-toml.ts / hook-settings.ts / README.md)。

## 1. 背景与问题

现有运行状态识别是「读屏三源引擎」:标题事件 + 屏幕快照 + 字节环,靠关键字匹配猜状态。用户实机反馈暴露两类误判(见 `docs/issues/2026-11-22-session-row-spinner-and-state.md`):切标签后隐藏页快照塌缩 → 误判 idle(Bug 1);打字回显被当工作证据 → 误判 working(Bug 2)。根因是读屏机制固有:证据是猜的,任何环境噪声都能骗过它。经五家 hook 能力调研,用户拍板改走 hook 通道:agent 自己上报状态,不猜。

## 2. 目标 · 非目标 · 失败形态

**目标**

- 状态证据源从「三源读屏」整体切换为「agent hook 事件 + PTY 生命周期」,状态判定不再读屏(标题/快照/字节三路输入全部移除)
- 五家接入:claude/codex/antigravity/pi 项目级注入,kimi 全局注入(用户明示授权)
- `SessionRunState` 枚举不变(working/waiting/idle/exited),渲染层 spinner、T11 等输入通知、IPC 契约零改动
- hook 配置合并写入:认领制,只增删改自己写入的条目,用户已有配置无损;提供显式移除
- hook 脚本/接收器 fail-open:任何失败不影响 agent CLI 会话本身

**非目标**

- 不做 OSC 7501 通道(调研记录为将来可选;kimi 的备选路)
- 不做 working 沉默自动降级(v1 接受「hook 失联则状态卡住,PTY 退出兜底」)
- 不做子代理/children 状态展示
- 不修 Bug 3(fit 可见性守卫,终端渲染独立修复,另行进行)
- 不移植 Orca 的 23 家 registry、WSL/SSH relay、remote 安装器

**失败形态**

- 合并写入破坏用户已有配置(claude settings.json 已有 hooks/permissions 被覆盖;kimi config.toml 用户 TOML 被毁)
- hook 事件路由到错误会话(串台)
- 接收器端口死亡导致用户在应用外裸跑 claude/kimi 时报错、卡顿(应静默 fail-open)
- 注入后 hook 不生效(claude 配置格式错、codex/pi 项目未信任)而应用无感知无提示
- kimi 全局注入残留:卸载应用后 config.toml 留下死配置

## 3. 选定方案

每家插件声明 hook 注入模板;注入器在**应用启动时 reconcile**(学 Orca:安装是应用级事实,不随会话清理),把 hook 配置**合并写入**各 agent 配置位(认领制 + fail-closed 保用户字节,两个实现件从 Orca 快照裁剪移植);hook 指向本应用主进程的 **loopback HTTP 接收器**(fail-open、短超时);**会话路由靠 spawn 时注入的 PTY 环境变量令牌**(pty-registry 既有 env 注入点追加 `SOLOPORT_SESSION_ID` / `SOLOPORT_HOOK_PORT`,hook 脚本继承整条环境链后读变量塞进 POST):同项目同 agent 多会话无歧义、同标签重进 agent 的会话漂移免疫、应用外裸跑因无令牌天然静默;cwd + agentId 归一化匹配仅作某家不继承 env 时的降级兜底(T6 path-match 复用),externalSessionId 不作路由键(回填时序缺口 + 同标签重进导致 session_id 漂移);状态引擎输入改为「hook 事件 + PTY 生命周期」,hook 事件按证据分级直落(事实型,同 `exited` 模式,不经去抖)。被否:保留读屏作兜底的双通道(用户明确不用读屏;复杂度翻倍);OSC 7501 通道(本版非目标)。

**事件映射**(详细归 spec):

| 状态 | claude | codex | kimi | pi(TS 扩展) | antigravity |
|---|---|---|---|---|---|
| working | UserPromptSubmit | UserPromptSubmit | TurnStarted / UserPromptSubmit | input / turn_start | PreInvocation |
| waiting | PermissionRequest、Notification(语义待校准) | PermissionRequest | PermissionRequest | ui_prompt_start | **无事件,此态不出现** |
| idle | Stop、StopFailure | Stop | Stop、Interrupt | ui_prompt_end(回 working)、agent_settled | Stop |
| exited | PTY onExit(不走 hook,五家同) | 同 | 同 | 同 | 同 |

**注入位**:claude `.claude/settings.json`(项目级);codex `.codex/hooks.json`(repo 级);antigravity `.agents/hooks.json`(workspace 级);pi `.pi/extensions/`(项目级 TS 扩展);kimi `~/.kimi-code/config.toml` `[[hooks]]`(全局,marker 块)。

## 4. 约束

- 渲染层永不 import main,一切经 bridge(AGENTS.md 工程边界)
- ADR-0003「应用永不改写 agent 存储」:hook 配置不是对话存储,但属写入用户配置域——kimi 全局写入是本 brief 记录的用户明示授权例外,由新 ADR 取代 ADR-0001 时一并载明
- 插件化边界(ADR-0006):hook 模板进插件包,框架按声明消费,新增 agent 仍是「一个插件包 + 清单一行」
- fail-open:hook 脚本与接收器的任何失败不得影响 agent CLI 会话(各家官方失败语义核实一致,见调研文档)
- 目录名用具体领域名,单测与源码同目录,纯逻辑测试口径不变(AGENTS.md)

## 5. 关键决策

- 纯 hook,状态判定不读屏,三源引擎整体退役 [你]
- kimi 走全局注入(突破 ADR-0001 顾虑,明示授权;marker 块方案随 Orca)[你]
- antigravity waiting 无事件、此态不出现,接受缺口 [你]
- 状态枚举四态不变,渲染层零冲击 [你]
- working 卡死 v1 不做沉默自动降级,PTY 退出兜底,实机观察后再议保险丝 [我,你确认]
- 注入生命周期 = 启动 reconcile + 显式移除,取消「随会话清理」语义(Orca 同款,ADR-0001 第三条顾虑由实践证伪)[我]
- 注入位四家项目级 + kimi 全局的混合策略(我们掌握项目列表,条件优于 Orca 的全全局)[我]
- 接收器 fail-open、脚本短超时、端口与静态配置解耦 [我,依据各家官方失败语义]
- 会话路由 = PTY env 令牌为主(`SOLOPORT_SESSION_ID` / `SOLOPORT_HOOK_PORT`),cwd+agentId 仅作降级兜底;externalSessionId 不作路由键(回填时序缺口、同标签重进 agent 导致 session_id 漂移)[我]
- Bug 3(fit 可见性守卫)独立于本特性另行修复;Bug 2 回显时间窗修复取消(被本特性整体取代)[我]
- 新 ADR 取代 ADR-0001(保留「屏幕信号曾为主通道」的历史,标注事实基础更新),本特性实施时落 [我]

## 6. 未定项

- 五家 hook 子进程是否完整继承 CLI 进程环境变量——**实施期第一验证项**(含 env 断言的探针 hook);不继承者走 cwd+agentId 降级并单独记录
- claude `Notification` 事件的确切覆盖面(可能比 PermissionRequest 广)——本机已装 2.1.220,实施期实机校准
- claude 中断(Esc)场景 `Stop` 是否触发——实机校准,不触发则 working 需补 Interrupt 侧校准
- codex / kimi / antigravity 本机未装:注入、事件、payload、失败行为全部装后复核
- 移除入口的 UI 形态(设置界面尚不存在;暂定随实现按现有 UI 惯例,授权项)
- 端口发现的具体形态(appData 发现文件 vs 固定端口回退)——授权项

## 7. 验收标准

### 7.1 验收条目

- claude 会话(本机):提交提示 → working spinner;回答完成 → 消失;权限对话框 → waiting 且 T11 通知照常触发
- pi 会话(本机):同上,经项目级 `.pi/extensions/` 扩展生效
- 原 Bug 1 场景:working 中切标签再切回,spinner 全程正确;原 Bug 2 场景:无回合时打字不触发 spinner
- 进程退出(/quit、崩溃、杀标签)→ exited
- 合并无损:预置含用户自有 hooks/内容的 claude settings.json 与 kimi config.toml,注入后用户内容逐字节保留
- 显式移除:managed 条目删除,用户内容保留;kimi marker 块整体摘除
- hook 脚本失败注入演练:接收器端口不可达时,claude 会话本身不报错不阻塞
- typecheck 双投影 + vitest 全绿;实机冒烟覆盖以上各项

### 7.2 测试接缝

- hook 事件 → 状态映射:纯函数 + fixture 回放(替代现 state-parser.test.ts 的读屏 fixture 体系)
- 配置合并/认领/移除:纯函数(kimi TOML marker 块解析、claude settings.json 合并,Orca 实现裁剪移植)
- 接收器编排层(import electron/http):T5/T8 先例,行为靠冒烟 + 关键纯逻辑抽接缝

## 8. 授权项

- hook 脚本的命令包装形态(Windows PowerShell/cmd 包装,参考 Orca 适配层);env 不继承时的降级形态(appData 端口发现文件 + cwd 路由)
- 移除入口 UI 位置与交互
- 注入器在启动 reconcile 之外是否补「spawn 前校验」(配置被删的快速自愈)及其实施形态
