# 状态监控与 Hook 通道 · 系统详解

> 2026-11-24 | 性质:系统文档(随实现演进更新;实现版本 = commit 0d8289fb,特性四层文档见 docs/plans/2026-11-23-hook-run-state/)
> 回答的问题:Soloport 怎么知道每个会话「忙不忙/等不等/闲不闲」,五家 agent 各自怎么接的,边界在哪。
> 关联:ADR-0007(决策)/ ADR-0001(被取代的旧决策)/ [能力调研](agent-hooks-capability-survey.md)/ [TUI 原理讲解](agent-tui-runtime-explainer.md)

## 一、四态模型

`SessionRunState`(shared/types.ts,持久化不落盘,纯运行时):

| 状态 | 含义 | 证据来源 |
|---|---|---|
| `working` | 回合进行中,agent 在生成/执行 | 各家 hook 事件(逐家映射见第四节) |
| `waiting` | 持有键盘等你决策(授权框/提问/扩展对话框) | `PermissionRequest` 类事件;antigravity 无事件此态不出现 |
| `idle` | 闲在提示符;**同时是「无信号」的缺省态** | tracker 创建即 seed;`Stop`/`agent_settled` 等收尾事件 |
| `exited` | PTY 进程退出(shell 结束) | PTY `onExit`——事实态,不经 hook,崩溃也兜住 |

渲染与通知的消费侧:侧栏 spinner 只表现 `working`;系统通知只发 `waiting`(等输入)与 `working→idle` 迁移(任务完成),且仅后台会话;`waiting`/`idle`/`exited` 无 spinner(其中 waiting 完全不可见——排查「卡状态」时先想这一条)。

## 二、总体架构

```
┌─ 应用启动 ──────────────────────────────────────────────┐
│ 注入器 reconcile:                                        │
│   脚本落盘(userData/hook-scripts/forwarder.mjs +         │
│   soloport-hook.cmd,node 路径已解析)                     │
│   遍历已添加项目 × 有声明的插件 → 合并写入配置位           │
│   kimi 全局 config.toml 一次                              │
│ 接收器 listen:127.0.0.1 随机端口 + 启动级随机 token       │
└─────────────────────────────────────────────────────────┘
┌─ 会话 spawn ────────────────────────────────────────────┐
│ spawn 前自愈 ensureProject(配置缺则补)                   │
│ PTY env 注入:SOLOPORT_SESSION_ID / _HOOK_PORT / _HOOK_TOKEN │
└─────────────────────────────────────────────────────────┘
        │ PTY → PowerShell → agent CLI(令牌沿进程链继承)
        ▼
   agent 触发 hook → CLI 拉起 soloport-hook.cmd --agent X --event Y
        │ stdin 载荷 + env 令牌
        ▼
   forwarder.mjs:POST http://127.0.0.1:PORT/hook
        │ {agent, sessionId, event, payload} + header token
        ▼
┌─ 主进程接收器 ──────────────────────────────────────────┐
│ resolveHookTarget:token 匹配 + 会话有活动 PTY            │
│ → trackerForHook → hook-tracker.onHookEvent(event)       │
│ → 查 def.state.hooks 三槽 → publish 事实直落(同态幂等)   │
│ → state:changed 广播 → 侧栏 spinner / 通知判定           │
└─────────────────────────────────────────────────────────┘
```

三条设计不变式:

1. **事实直落,不猜**:hook 事件是 agent 自己上报的权威事实,无安静门槛、无去抖;同态幂等由 publish 早退保证(广播数 = 真实变化数)。
2. **无信号 = 无状态显示**:hook 失联(未信任/被删/断)则恒 idle 或卡住,不用读屏兜底、不自动降级(working 卡死以 PTY 退出兜底);v1 明码标价。
3. **应用外互不干扰**:应用外裸跑的 agent 没有 env 令牌,转发脚本早退零发送;kimi 全局配置同样受益。

## 三、路由:令牌与命令形态(实机实证)

- **三令牌**(pty-registry spawn 时追加 env,由 ipc/pty 从接收器取):`SOLOPORT_SESSION_ID`(路由主键,绑「标签」不绑某次 agent 会话——同标签重进 agent 依然正确)/ `SOLOPORT_HOOK_PORT` / `SOLOPORT_HOOK_TOKEN`(防本机其他进程伪造)。
- **转发链**:claude → hook 配置命令 → `soloport-hook.cmd`(launcher,内部带引号调 node + forwarder.mjs)→ 读 env + stdin 载荷 → POST。任何失败静默、恒 exit 0(fail-open);env 缺失早退零发送。
- **Windows 命令形态(2026-11-23 claude 2.1.220 探针定案)**:配置里的命令串 = **裸路径 + 正斜杠 + 无引号 + 无空格**,指向 launcher;带引号/带空格/`cmd /s /c ""…""` 双引号包装形态实测不触发。launcher 文件内部引号原生安全,可承载带空格的 node 路径。
- **脚本落盘位置**:userData/hook-scripts/(无空格受控路径);scriptsDir 含空白则整体跳过注入并记日志(已知边界)。
- **认领锚点**:配置合并按 command 含 `soloport-hook.cmd` 稳定子串认领自家条目(防路径漂移重复注入);antigravity 按固定 hook 名 `soloport-state` 认领。

## 四、五家逐家实现

### claude(本机 2.1.220,已验证)

- 注入位:项目级 `.claude/settings.json`(JSON 合并,认领制,用户 hooks/permissions 语义保留)
- 映射:working = `UserPromptSubmit`/`PostToolUse`/`PostToolUseFailure`;waiting = `PermissionRequest`/`Notification`;idle = `Stop`/`StopFailure`
- 回位路径:授权批准 → `PostToolUse` 回 working;拒绝 → `PostToolUseFailure` 回 working(Orca 同款语义)
- 注意:`Notification` 官方语义较宽(含 idle 提醒),挂 waiting 可能过宽——**待实机校准,可能收窄**
- 注意:交互首会话 claude 会弹工作区信任对话框,接受后 hooks 生效;未信任期间无状态属 claude 侧行为

### codex(本机未装,装后复核)

- 注入位:repo 级 `.codex/hooks.json`(形状 = claude 同构 `hooks.<Event>[].hooks[]`,共用同一 merge 接缝)
- 映射:working = `UserPromptSubmit`/`PostToolUse`;waiting = `PermissionRequest`;idle = `Stop`
- 门槛:仅从 **trusted** 层加载 repo hooks——未信任静默无信号
- 备忘:旧通道 `notify`(仅 agent-turn-complete)与 hooks.json 并存,勿混用

### kimi(本机未装,装后复核)

- 注入位:**全局** `~/.kimi-code/config.toml` 的 `[[hooks]]` 数组,marker 块包裹(`# >>> soloport-managed-kimi-hooks >>>` / `<<<`)——官方不提供项目级,此为用户明示授权的例外(ADR-0007 载明)
- 映射:working = `TurnStarted`/`UserPromptSubmit`/`PermissionResult`/`PostToolUseFailure`;waiting = `PermissionRequest`;idle = `Stop`/`StopFailure`/`Interrupt`
- 字节保留口径:marker 区间外用户 TOML 逐字节不动;半截区间 fail-closed 不动
- 排障:全局注入影响应用外 kimi 会话的配置形态,但无令牌不发送;卸载清理走「显式移除」

### pi(本机 1.6.0,已验证)

- 注入位:项目级 `.pi/extensions/soloport-state.ts`(**进程内 TS 扩展**,非 shell hook;pi 信任该项目后才加载)
- 机制差异:扩展直接 `pi.on(event, …)` 订阅后 fetch POST,不经 forwarder 脚本;事件清单由注入器从插件 state.hooks 并集生成(单一事实源仍是插件声明)
- 映射:working = `input`/`turn_start`/`turn_end`;waiting = `ui_prompt_start`/`project_trust`;idle = `agent_settled`/`session_shutdown`
- 语义精校(2026-11-24 源码核对):
  - `input` = **提交的提示词**(`emitInput` 仅由 steer/followUp/prompt 提交路径调用),不是逐键
  - `turn_end` ≠ 回合链结束(可能续跑),`agent_settled` 才是权威 idle
  - `ui_prompt_start/end` 只报「阻塞屏开/关」不报后续走向——**`ui_prompt_end` 不得挂 working**(启动欢迎屏关闭即误触发,冒烟已修);「回 working」由 turn_start/turn_end/agent_settled 自然覆盖
  - `project_trust` 仅在未保存信任的首次发出,且先于项目扩展加载——项目级扩展实际收不到,映射保留为防御
- 已修缺陷(冒烟①):启动欢迎屏关闭发 `ui_prompt_end` 曾误置 working,spinner 卡到首回合结束——已摘除并加 `startup-splash` 回归用例

### antigravity(本机未装,装后复核)

- 注入位:workspace 级 `.agents/hooks.json`(顶层 hook 名映射;工具事件 PreToolUse/PostToolUse 包 `{matcher, hooks[]}`,其余事件直接 handler 数组;认领 = 固定名 `soloport-state`)
- 映射:working = `PreInvocation`/`PostToolUse`;waiting = **空**(官方六事件无等待类,此态不出现);idle = `Stop`(载荷带 fullyIdle)
- 排障:社区反馈部分版本仅 agy CLI 执行 hooks——本项目只跑 CLI,无影响

## 五、注入器生命周期

| 时机 | 动作 | 覆盖 |
|---|---|---|
| 应用启动 `reconcile()` | 脚本落盘 + 全部已添加项目写配置 + kimi 全局 | 主流程;应用更新后脚本刷新 |
| 运行期添加项目 | 补写该项目(ipc/projects 联动) | 中途加项目 |
| 每次 spawn 前 `ensureProject()` | 配置存在性快校验,缺则补 | 自愈:用户手删/git clean |
| 删除项目 `removeProject()` | 摘该项目四家注入(ipc/projects 联动) | 用户内容保留 |
| 显式移除 `hooks:remove`(IPC)| `removeAll()` 全部项目 + kimi 全局 | 用户主动停用(UI 入口为授权项,现可控制台直调 `window.api.hooks.remove()`) |

幂等由认领制保证(JSON:command 子串认领后替换;antigravity:键名替换;kimi:marker 区间替换;pi:文件覆盖带版本注释);用户已有配置保留口径:JSON 类「语义保留」(deep-equal)、TOML 类「字节保留」(区间外逐字节不动)、pi 文件仅删本应用模板。

## 六、接收器与通知

- 接收器(agent-hooks/receiver.ts):仅 127.0.0.1;`listen(0)` 随机端口;header token + body 校验 + 64KB 上限;`resolveHookTarget` 纯函数四反例全测(token 不匹配/无活动 PTY/字段缺失 → 401/400 静默,不投递)。
- tracker 生命周期 = PTY 生命周期:`trackerForHook` 沿 `activeSessionIds` 守卫,迟到事件不为死会话复活 tracker;`onExit` 直落 exited。
- 通知(notify.ts 接缝,迁移感知):
  - `waiting` 进入 + 后台 → 「会话在等你输入」
  - `working→idle` 迁移 + 后台 → 「任务已完成」(2026-11-24 用户需求增补)
  - 聚焦会话(窗口聚焦且前台标签)一律不打扰;seed(null 前态)不发;waiting→idle 不算完成

## 七、已知边界与缺口(明码标价)

1. **信任门槛**:claude(工作区信任)/codex(repo trust)/pi(project trust)未接受则 hooks 不加载 → 静默无信号;交互模式首会话由各家自行弹框。**修复手段 = 在终端里接受一次信任**。
2. **antigravity waiting 缺口**:官方无等待类事件,该家授权框期间无状态、无等待通知。
3. **working 卡死**:hook 失联(配置被删/CLI 升级改事件)而进程活着 → working 不自动回落;PTY 退出兜底崩溃场景。v1 不做沉默降级,频发再议「最后事件超 N 分钟降 idle」保险丝。
4. **claude `Notification` 语义待校准**:可能比 PermissionRequest 宽(含 idle 提醒),过宽则从 waiting 槽收窄。
5. **userData 路径含空白**:裸命令形态不成立,注入整体跳过并记日志(会话本身不受影响,只是无状态)。
6. **claude `PostToolUseFailure`**:旧版本可能不发该事件(引擎对未声明事件自动忽略,声明无害)。

## 八、代码地图

| 文件 | 职责 |
|---|---|
| `src/shared/agents.ts` | AgentStateRules(hooks 三槽)+ HookInstallKind + 各插件声明 |
| `src/main/agent-state/hook-tracker.ts` | 引擎:事件→状态直落、幂等、seed、exited |
| `src/main/agent-state/__fixtures__/hook-fixtures.ts` | 五家事件序列正/反样本(期望值锚点=官方文档) |
| `src/main/agent-hooks/receiver.ts` | loopback 接收器 + resolveHookTarget 路由纯函数 |
| `src/main/agent-hooks/forwarder-script.ts` | forwarder.mjs/launcher 内容生成 + 命令串构建 |
| `src/main/agent-hooks/injector.ts` | reconcile/ensureProject/removeProject/removeAll 编排 |
| `src/main/agent-hooks/merge/claude-style-hooks.ts` | claude+codex JSON 合并(认领/幂等/语义保留) |
| `src/main/agent-hooks/merge/antigravity-hooks.ts` | antigravity hook 名映射合并 |
| `src/main/agent-hooks/merge/kimi-toml.ts` | kimi marker 块注入/摘除(字节保留) |
| `src/main/agent-hooks/pi-extension-template.ts` | pi 扩展模板(事件清单注入式生成) |
| `src/main/ipc/state.ts` | receiver 接线 + tracker 表 + state:changed + 通知判定 |
| `src/main/ipc/pty.ts` / `pty-registry.ts` | spawn env 三令牌注入 |
| `src/main/ipc/hooks.ts` | hooks:remove 通道 |
| `src/main/notify.ts` | 通知判定接缝(waiting/done,迁移感知) |
| 测试 | hook-tracker.test / forwarder-script.test / receiver.test / merge 三件 / injector.test / notify.test(共 40+ 用例) |

## 九、排障速查

| 症状 | 先查什么 |
|---|---|
| spinner 全程不亮 | ①项目配置文件存在且含 `soloport-hook.cmd`(reconcile 是否跑过)②CLI 信任是否接受过 ③env 是否注入(spawn 日志)④转发是否到达(临 DBG `console.log` 于 receiver onEvent,用后即删) |
| spinner 卡 working 不落 | 该家 idle 事件是否真的发出(pi=agent_settled / claude=Stop);CLI 升级改事件名是最常见原因 |
| 应用外裸跑 agent 弹 hook 报错 | 不应发生(env 早退);若见报错查是否手改过配置指向 |
| 想彻底停用 | `window.api.hooks.remove()` 或删配置中含 `soloport-hook.cmd` 的条目(kimi 删 marker 区间) |

探针考古:开发期探针临时件存 `.tmp/hook-probe/`(gitignore,含 env 继承探针/claude 形态对照/pi 全环复现),排障可复用其形态。
