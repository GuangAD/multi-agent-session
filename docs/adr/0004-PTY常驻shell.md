# 0004 - PTY 常驻 shell,agent CLI 在 shell 内启动

日期:2026-11-20 | 状态:已采纳

## 背景

T3 原形态为「PTY 直接跑 agent CLI」:node-pty spawn 的 file 就是 agent 命令。CLI 退出即 PTY 退出,标签页失去存在意义(现行词汇表为「CLI 退出即亡」)。用户在 T3 评审期提出期望:CLI 退出后终端依然可用,可在原终端自由敲命令、再次进入 agent CLI——这正是常规终端的使用心智(shell 常在,程序来了又走)。

## 决策

每个标签页的 PTY 跑一个常驻 shell(Windows 首发用 cmd),agent CLI 由应用在 shell 内自动启动(向 shell 写入启动命令)。CLI 退出(正常结束或崩溃)后回到 shell 提示符:标签页保留、画面保留、终端可继续交互;用户可再次手动进入 agent,重开历史会话时应用自动注入 resume 命令。关闭标签页(点 ×)才杀 shell;应用退出 killAll 全量清理。

## 为什么不用「PTY 直接跑 agent + 退出后只读保留」

- 只读画面无法满足「终端依然可以使用」的核心期望,用户与 agent CLI 的关系不是一次性对话而是持续的工作会话
- 自动重开 agent(不经 shell)会把「重进」限死在应用编排的 resume 流程上,失去手动灵活性
- shell 底座与常规终端习惯一致:exited 语义自然收敛为「终端进程死亡」,agent 在不在前台交给状态引擎按信号判断

## 后果

- `pty:exit`(PTY 退出)= shell 死亡 = 标签页终端终结,语义唯一;agent CLI 退出不再触发 pty:exit,由 T5 状态引擎按标题/屏幕信号回落(如 idle)
- T5 的 `exited` 状态与 T11 的退出通知绑定 shell 生命周期;「agent 跑完没跑完」的判断完全依赖三源信号,提高对状态引擎的依赖度
- T8 的 resume/续接形态改为「重开会话 = 新 shell PTY + 注入 resume 命令」,不再重建原 agent 进程参数
- shell 内启动命令的转义/引号规则成为新接缝(Windows cmd 的引号语义),T3.5 落地并测试
- 采样落盘(AGENT_SESSIONS_SAMPLE)语义不变:仍按 PTY 字节流采集,shell 回显一并入样
