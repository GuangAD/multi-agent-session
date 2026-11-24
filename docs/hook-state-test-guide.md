# Hook 状态监控 · 分 Agent 测试指南

> 2026-11-24 | 用途:逐 agent 手动验证状态监控(hook 通道);配合 docs/hook-state-monitoring.md(系统详解)使用。
> 状态约定:✅ 通过 / ❌ 失败(记现象开 issue)/ ⏭ 跳过(本机未装)。
> 通用前置(每次测试前做一遍):
> 1. `pnpm dev` 启动应用(启动即触发 reconcile:脚本落盘 + 全项目注入 + kimi 全局)
> 2. 确认注入存在:目标项目目录下应有对应文件(各 agent 章节列明)
> 3. 侧栏认知:spinner 只在 working 转;waiting **无任何可见表现**(橙点已移除);通知只弹后台会话

## 〇、通用用例(每家 agent 都过一遍,替换 agent 名即可)

| # | 操作 | 预期 |
|---|---|---|
| C-1 状态点亮 | 在会话里提交一条提示(如「回复:ok」) | 提交后侧栏该会话行首 spinner 转(working) |
| C-2 状态收口 | 等 agent 回答结束 | spinner 消失(idle) |
| C-3 授权等待 | 让 agent 执行一个需要授权的操作(如写文件/跑命令) | 出现授权框 → (该家支持 waiting 时)状态进入 waiting;批准后回到 working,继续到回答结束落 idle |
| C-4 等输入通知 | C-3 期间把窗口最小化或切到别的标签 | 系统通知「会话在等你输入」;点击通知恢复窗口并切到该标签 |
| C-5 完成通知 | 后台会话提交一条任务,切走 | 回答完成瞬间系统通知「任务已完成」;前台正看着时**不弹** |
| C-6 打字反例 | agent 闲着时,在终端/输入框打字(不提交) | spinner **不亮**(打字回显不再算工作证据) |
| C-7 切标签反例 | working 期间切到另一标签再切回 | spinner 全程保持,不消失不闪断 |
| C-8 退出语义 | agent 内退出(如 `/quit`、Ctrl+C 退出 CLI)回 shell | 状态落 idle(**不是** exited——shell 还在);关闭标签/在 shell 里 `exit` → exited |
| C-9 重开自愈 | 手动删掉该项目的注入配置文件 → 应用内重开会话 | spawn 前自动补写(自愈),状态功能恢复 |

## 一、claude(本机 2.1.220,可完整测试)

注入检查:`<项目>/.claude/settings.json` 存在,`hooks` 下含 `UserPromptSubmit`/`Stop`/`PermissionRequest` 等键,条目 command 含 `soloport-hook.cmd`。

| # | 用例 | 操作 | 预期 |
|---|---|---|---|
| K1-1 | 信任门槛(首目录一次) | 全新项目目录建 claude 会话 | 终端内弹工作区信任对话框 → 接受后 hooks 生效;**接受前的会话无状态,不算 bug** |
| K1-2 | 全环 | 通用 C-1 → C-2 | 同通用预期 |
| K1-3 | 授权全环 | 通用 C-3 → C-4 | waiting 生效 + 通知;批准 → PostToolUse 回 working |
| K1-4 | 拒绝路径 | 授权框出现时选**拒绝** | 回合继续(spinner 保持在 working——`PostToolUseFailure` 回位),最终 Stop 落 idle |
| K1-5 | 完成通知 | 通用 C-5 | 「任务已完成」通知 |
| K1-6 | 打字/切标签反例 | 通用 C-6、C-7 | 均不误触发 |
| K1-7 | Esc 打断(校准项) | 回答中途按 Esc | 观察 spinner 是否落 idle;**若卡 working 记录下来**——这是已知待校准点(Orca 靠输入推断解决,我们不改架构,实测后定) |
| K1-8 | Notification 语义(校准项) | 闲在提示符放置数分钟 | 观察 spinner 是否被 Notification 事件误点亮;**若亮,记录事件名**——可能需从 waiting 槽收窄 |
| K1-9 | 用户配置共存 | 预置含用户自有 hook 的 settings.json → 重启应用 | 用户条目原样保留,managed 条目追加;删除项目 → managed 摘净、用户条目保留 |

## 二、pi(本机 1.6.0,可完整测试)

注入检查:`<项目>/.pi/extensions/soloport-state.ts` 存在,头部含「Managed by Soloport」,事件清单含 `agent_settled`。

| # | 用例 | 操作 | 预期 |
|---|---|---|---|
| K2-1 | 欢迎屏回归(冒烟①已修) | 新开会话 → 出现「Welcome back! Press any key」欢迎屏 → 按键/等 29s 关闭 | 关闭后 spinner **不亮**(修复前会卡 working) |
| K2-2 | 项目信任(首目录一次) | 全新项目目录建 pi 会话 | pi 自己的信任对话框;**接受后扩展才加载——首会话可能无状态,重开生效,不算 bug** |
| K2-3 | 全环 | 通用 C-1 → C-2 | 提交即亮(input/turn_start),回答完落 idle(agent_settled) |
| K2-4 | 中断收口 | 回答中途 Ctrl+C 打断 | 落 idle(打断替代 Stop 的收口语义;若卡 working 记录) |
| K2-5 | 扩展对话框 waiting | 触发一个带确认框的扩展功能(如 /council 类) | 阻塞屏期间 waiting(不可见,但 C-4 通知应弹) |
| K2-6 | 退出回 shell | `/quit` | spinner 消失(idle),标签还在、可再进;shell `exit` → exited |
| K2-7 | 打字/切标签反例 | 通用 C-6、C-7 | 均不误触发(2026-11-24 修复后重点回归) |

## 三、codex(本机未装——装后复核)

前置:安装 codex;在项目目录首跑一次接受 repo trust(**.codex/hooks.json 仅从 trusted 层加载**)。

注入检查:`<项目>/.codex/hooks.json` 存在,`hooks` 键下含 `UserPromptSubmit`/`PermissionRequest`/`Stop` 等,handler command 含 `soloport-hook.cmd`。

| # | 用例 | 操作 | 预期 |
|---|---|---|---|
| K3-1 | 信任门槛 | 未信任目录建 codex 会话 | hooks 不加载 → 无状态(**预期行为**);接受 repo trust 后重开 → 恢复 |
| K3-2 | 全环 | 通用 C-1/C-2/C-3 | 提交亮、完成灭、授权 waiting |
| K3-3 | 打字反例 | 通用 C-6 | 不误触发 |
| K3-4 | env 继承 | H6 复核:转发是否带正确 sessionId | 后台会话通知能点到正确标签即证路由正确 |

## 四、kimi(本机未装——装后复核)

前置:安装 kimi;注意注入在**全局** `~/.kimi-code/config.toml`(影响应用外 kimi 会话的配置,但无 env 令牌不发送)。

注入检查:`~/.kimi-code/config.toml` 含 `# >>> soloport-managed-kimi-hooks >>>` marker 块,块内 `[[hooks]]` 条目 command 含 `soloport-hook.cmd`;**你自己的 TOML 内容与自有 [[hooks]] 逐字未动**。

| # | 用例 | 操作 | 预期 |
|---|---|---|---|
| K4-1 | 全环 | 通用 C-1/C-2/C-3 | TurnStarted 亮、Stop 灭、PermissionRequest waiting |
| K4-2 | 打断 | 回答中 Esc | Interrupt → idle |
| K4-3 | 用户配置共存 | 预置含自有 [[hooks]] 与其他表的 config.toml → 重启应用 | marker 块注入,自有内容逐字节保留 |
| K4-4 | 显式移除 | `window.api.hooks.remove()` | marker 块整体摘除,自有内容保留 |
| K4-5 | 打字反例 | 通用 C-6 | 不误触发(旧读屏时代 kimi 必现的 Bug 2,重点回归) |

## 五、antigravity(本机未装——装后复核)

注入检查:`<项目>/.agents/hooks.json` 存在,顶层含 `soloport-state` 键(内含 PreInvocation/PostToolUse/Stop 三事件;工具事件带 matcher 包装)。

| # | 用例 | 操作 | 预期 |
|---|---|---|---|
| K5-1 | 全环(仅 working/idle) | 通用 C-1/C-2 | PreInvocation 亮、Stop 灭 |
| K5-2 | waiting 缺口确认 | 触发授权框 | **无任何状态变化、无等待通知——预期行为**(官方无等待事件,已知缺口) |
| K5-3 | 打字/切标签反例 | 通用 C-6、C-7 | 不误触发 |
| K5-4 | 用户配置共存 | 预置用户自有 hook 名 → 重启 | `soloport-state` 键追加,用户键保留;删除项目 → 本键摘除 |

## 六、跨家专项

| # | 用例 | 操作 | 预期 |
|---|---|---|---|
| X-1 | 同项目多会话路由 | 同一项目同时开两个 claude 会话,各提交一条 | 各自 spinner 独立正确(令牌按标签路由,不串台) |
| X-2 | 应用外裸跑零干扰 | 在系统终端(非本应用)cd 到某项目目录裸跑 claude,随便聊 | 本应用内**无任何状态变化**;裸跑会话**不报 hook 错误**(无令牌早退) |
| X-3 | 进程崩溃兜底 | 会话 working 时直接杀 CLI 进程(任务管理器) | exited(PTY onExit 兜住) |
| X-4 | 显式移除与恢复 | `window.api.hooks.remove()` → 各项目配置摘净 → 重启应用 | 摘净后再 reconcile 写回,状态功能恢复 |
| X-5 | 项目删除联动 | 删除一个已注入的项目 | 该项目注入文件中 managed 条目摘除(用户内容保留);重新添加项目 → 自动重注入 |

## 七、预期内「不算 bug」清单(先对照再报 issue)

1. 首次在项目目录使用某 agent,各家自己的信任对话框;接受前无状态。
2. antigravity:授权期间无状态、无等待通知(官方无事件)。
3. hook 失联时 working 卡住不自动回落(v1 设计,PTY 退出兜底)。
4. 前台正看着的会话,等待/完成都不弹通知。
5. pi 首会话(信任接受前)无状态,重开生效。
6. claude 2.1.220 无 `onFailure` 字段(2.1.295+ 才有),hook 失败表现为警告而非阻塞,正常。

---

结果记录:直接在对应条目前标 ✅/❌/⏭ + 日期;失败的开 issue 并附「操作步骤 + 实际现象 +DBG 日志(如有)」。测试中发现新事件名/新弹窗形态,先查 docs/hook-state-monitoring.md 第四节该家映射,再定是否为新覆盖点。
