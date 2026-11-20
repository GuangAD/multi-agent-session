# Agent Sessions:全新最小应用开发计划

> 本文件是本项目唯一执行计划,由 mini-orca 会话于 2026-11-20 生成并逐项核对过 Orca v1.4.265 源码。新会话从这里开始:参考快照 `.reference/orca-1.4.265`(完整仓库,只读,已 gitignore)已就位,直接按「分阶段实施」从 M1 做起;附录 A 是 Orca 借鉴清单;附录 B 是空目录初始化清单(M1 施工图)。

## 目标

从零构建一个轻量桌面应用(代号 `agent-sessions`,名字可改):以目录为单位管理项目,每个项目下新建会话,会话 = 在终端里跑指定 agent CLI。支持导入 agent 已有的历史会话。带文件浏览、基本 Git 面板和 agent 运行状态识别。

已确认的范围:

- **终端会话(核心)**:左侧目录分组 + 会话列表 + 新建会话 + xterm 终端
- **agent 支持范围(收窄为 5 个,配置驱动)**:Claude Code、Codex CLI、Antigravity CLI、Pi、Kimi Code CLI——每个都完整支持层次 1(安装检测)、层次 2(身份显示)、层次 3(运行状态识别);**只支持这 5 个**,接入新 agent 仅需新增一个定义文件
- **会话导入**:选择一个 agent,扫描该 agent 在磁盘上的会话存储,把「属于当前项目目录」的所有历史会话导入应用;导入的会话以普通记录挂在项目会话列表下,点击与「+」新建行为一致(在项目目录拉起该 agent CLI)
- **文件浏览**:右侧文件列表(树),点击只读查看内容
- **Git 面板**:status、diff 查看、暂存、提交、分支切换
- **会话持久化**:会话列表落盘,重启不丢;自建会话重开时自动续接对话内容(借 agent 自身存储,见 M4);不做 PTY 级画面回放

## 技术栈(与 Orca 同款,全部为成熟单品)

- electron + electron-vite + TypeScript strict
- React 19 + Zustand(状态)+ Tailwind CSS 4(样式)
- node-pty(PTY)+ @xterm/xterm + addon-fit(终端)
- simple-git(status/diff/log/stage/commit 封装)
- 持久化:`userData/projects.json` 自读写(fs + JSON,不引 store 库)

## agent 配置层(核心抽象)

```
src/main/agents/
├── agent-types.ts        # AgentDefinition 类型(shared 导出,渲染层只读引用)
├── agent-registry.ts     # 注册表:收集全部定义,供检测/选择器/解析器/导入查询
└── definitions/
    ├── claude.ts         # Claude Code    (command: claude)
    ├── codex.ts          # Codex CLI      (command: codex)
    ├── antigravity.ts    # Antigravity    (command: agy)
    ├── pi.ts             # Pi             (command: pi)
    └── kimi.ts           # Kimi Code      (command: kimi,别名 kimi-code)
```

```ts
type AgentDefinition = {
  id: string
  name: string                 // 层次2:显示名
  command: string              // 层次1:PATH 探测命令名;探测失败时设置里可覆盖路径
  icon: string                 // 层次2:图标 id(第一版用首字母彩色徽标,品牌图标后换)
  state: {                     // 层次3:运行状态识别规则
    workingPatterns: string[]
    waitingPatterns: string[]
  }
  sessions?: {                 // 会话存储接入(M4):发现/解析/续接
    scan: SessionScanner       // 从磁盘发现并解析会话{id, cwd, title, updatedAt}
    resumeCommand?: (session: ExternalSessionRef) => string  // 五 agent 已全部验证;入参含 id 与 filePath(pi 按转录路径续接);缺失则重开原样拉起
  }
}
```

框架侧(检测、新建会话选择器、状态解析器、导入扫描、会话行渲染)全部只依赖 `AgentRegistry`,**新增 agent = 新增一个 definitions 文件,其余零改动**。新建会话只从注册表清单中选择,不提供自由命令输入。

会话扫描器参考实现:Orca 仓库 `src/main/ai-vault/scanners/<agent>/` 对这 5 个 agent 都有现成的存储解析代码(MIT、同源代码库),移植裁剪其解析逻辑,不做从零逆向。

## 架构

```
agent-sessions/
├── AGENTS.md                  # 项目规范(建仓首件事)
├── electron.vite.config.ts
├── src/
│   ├── main/                          # Electron 主进程:全部 fs/pty/git 逻辑在此
│   │   ├── index.ts                   # 入口:窗口创建 + IPC 装配 + 退出清理(M1)
│   │   ├── app-window.ts              # 主窗口创建与状态(M1)
│   │   ├── ipc/                       # IPC 注册,按域一文件(M1 起)
│   │   │   ├── channels.ts            # 通道名常量,与 shared 契约一一对应
│   │   │   └── projects.ts / sessions.ts / pty.ts / files.ts / git.ts / agents.ts
│   │   ├── agents/                    # agent 配置层(M2)
│   │   │   ├── agent-types.ts         # AgentDefinition 类型
│   │   │   ├── agent-registry.ts      # 注册表:检测/选择器/解析器/导入统一入口
│   │   │   └── definitions/           # claude.ts / codex.ts / antigravity.ts / pi.ts / kimi.ts
│   │   ├── command-path/
│   │   │   └── command-path-resolver.ts   # PATH 探测(移植 Orca,M2)
│   │   ├── pty-registry.ts            # PTY 创建/杀/resize/data 转发(M2)
│   │   ├── agent-state/               # 状态识别(M3)
│   │   │   ├── state-parser.ts        # 三源匹配:标题 / 屏幕快照 / 字节流环形缓冲 + 去抖
│   │   │   └── __fixtures__/          # 各 agent 输出正/反样本
│   │   ├── session-store/             # 持久化与导入(M2/M4)
│   │   │   ├── store-persistence.ts   # store.json 原子读写(projects + sessions + settings)
│   │   │   └── session-import/
│   │   │       ├── scanner.ts         # 定位存储 → 解析 → cwd 匹配 → 去重导入(M4)
│   │   │       └── __fixtures__/      # 各 agent 脱敏真实会话样本
│   │   ├── fs-tree.ts                 # 文件树扫描(M5)
│   │   ├── file-content.ts            # 单句柄读取 + 二进制探测 + 截断(移植 Orca,M5)
│   │   └── git-service.ts             # simple-git 封装:status/diff/stage/commit/branch(M6)
│   ├── preload/
│   │   └── index.ts                   # contextBridge 类型化 API(M1)
│   ├── shared/                        # 进程间契约,渲染层唯一类型来源(M1)
│   │   ├── types.ts                   # Project / Session / SessionRunState / 树节点
│   │   └── ipc-contract.ts            # 请求/响应/事件类型
│   └── renderer/src/
│       ├── App.tsx                    # 三栏布局:侧栏 | 终端区 | 文件/Git 面板(M1)
│       ├── store/                     # Zustand,按域切片
│       │   ├── app-store.ts           # 装配(M1)
│       │   ├── projects-slice.ts      # 项目目录(M1)
│       │   ├── sessions-slice.ts      # 会话列表与打开(M2)
│       │   ├── run-state-slice.ts     # 会话运行状态(M3)
│       │   └── panels-slice.ts        # 右侧面板状态(M5/M6)
│       ├── ipc/bridge.ts              # window.api 类型化封装(M1)
│       ├── components/
│       │   ├── sidebar/               # M2:Sidebar / ProjectGroup / SessionRow / NewSessionMenu;M4 加 ImportMenu
│       │   ├── terminal/              # M2:TerminalTabs / TerminalView / use-terminal(xterm 生命周期)
│       │   ├── file-panel/            # M5:FileTreePanel / FileTree / FilePreview
│       │   ├── git-panel/             # M6:GitPanel / StatusList / DiffView / CommitBox
│       │   └── ui/                    # 按钮 / agent 徽标 / 空态(M1 起)
│       └── agents-display.tsx         # agent 名称与徽标渲染(M2 首字母,M7 换品牌图标)
# 单测与源码同目录(*.test.ts),不设独立 tests/;打包配置 electron-builder.yml 于 M7 加入
```

数据模型(最小):

```ts
Project { id, path, name }
Session {
  id, projectId, agentId, title, createdAt, lastOpenedAt
  origin: 'created' | 'imported'
  externalSessionId?: string              // imported:去重键;created:启动后回填,供续接
  activityAt?: string                     // 导入会话最近活动时间,排序展示用
}
SessionRunState = 'working' | 'waiting' | 'idle' | 'exited'   // 运行时,不持久化
Settings { defaultAgentId }
```

- 新建会话:`从注册表选 agent → spawn PTY(cwd = 项目目录,挂 agent 命令)→ tab 挂 xterm`;重开已有会话:created 会话有 externalSessionId 且 agent 支持续接时跑 resume,imported 及其余情况原样拉起
- 导入会话:点击 = 在项目目录 spawn PTY 拉起该 agent(与「+」新建完全一致);重复导入按 `(agentId, externalSessionId)` 去重,续聊由用户在 agent CLI 内自行操作

## 分阶段实施

### M1 骨架(先行)

electron-vite 脚手架、三栏空布局(左栏、右栏均可隐藏收起)、IPC 框架(preload + shared types)、目录选择对话框、项目列表持久化与左栏渲染、AGENTS.md 与 .gitignore。

### M2 终端会话(核心价值)

agent 配置层(注册表 + 5 个定义文件)、PATH 检测、node-pty 注册表、xterm 容器(tab 切换/resize/fit)、新建会话选择器、会话持久化与重启后重开、会话重命名、关闭与删除。删除只移除应用记录(弹确认;有运行中标签页则连带关闭),重命名只改应用侧显示名——两者均不改写 agent 存储,重命名后 agent 侧原名与 externalSessionId 常驻可查,供在 CLI 中认亲。命令名沿用 Orca catalog(antigravity=agy、kimi,别名 kimi-code),M2 在本机 PATH 实测确认;pty-registry 内置采样落盘开关(debug 可开,把 PTY 字节流与屏幕快照落盘),供 M3 直接采样,不再回头改 M2 代码。xterm scrollback 默认 10000 行、设置可调(Orca 预设 5000/10000/25000/50000,取第二档;硬上限 50000);不做用户级输出日志——历史内容由 agent 自身存储负责,关闭后重开走 resume 续接;PTY 落盘仅作 debug 采样。职责边界:终端回显归 agent CLI,不显式关闭则一直运行,关闭后的历史由 resume 负责。

### M3 agent 状态识别(层次 3,全部 5 个;标题 + 屏幕快照,不用 hook)

- 引擎输入三源:标题(xterm `onTitleChange` 事件,claude/pi 主信号)+ 屏幕快照(常驻 xterm `buffer.active` 节流读,codex/antigravity 主信号)+ 字节流环形缓冲(辅助,最近 N 字节跨 chunk 匹配);状态变更去抖;按会话 `agentId` 从注册表取规则
- 信号依据(经 Orca 规则核实):claude 标题转圈符号 vs 纯标题;pi 标题 `π ⠋` vs `π -`;codex 屏幕地标(头部横幅/输入框就绪/「implement this plan?」菜单);antigravity 屏幕地标(Orca `antigravity.json` 6 条规则改编);waiting 走屏幕菜单类地标;进程退出 → exited
- 采样先行:用 M2 内置的落盘开关采齐 5 个 agent 的正/反样本(启动/干活/提问/退出各一段),规则配 fixture 回放测试,此为 M3 首个任务
- kimi 降级预案:看屏幕识别 kimi 状态无公开先例(Orca 亦无其屏幕规则),最坏只做「最近输出 → working、进程退出 → exited」,waiting 并入相邻态;采样找到可靠信号再升级
- 渲染:会话行状态点(working 绿/等待橙/退出灰)
- hook 通道(hook 上报/注入配置/本地接收服务)整体移出第一版,列为将来可选升级;触发条件:kimi/antigravity 降级精度实际不可接受时再评估

### M4 会话存储接入:导入 + 自动续接

- 通用扫描流程:按 `AgentDefinition.sessions.scan` 定位各 agent 的存储目录 → 解析会话(id、cwd、标题、更新时间)→ 按项目目录匹配(cwd 归一化后精确匹配,Windows 忽略大小写)
- 各 agent 存储适配:claude(`~/.claude/projects/**`)、codex(`~/.codex/sessions/**`)直接实现;antigravity、pi、kimi 从 Orca 扫描器移植裁剪,存储路径在用户机器上实测核对
- 交互:项目会话区「导入」按钮 → 选 agent → 扫描 → 全部导入并去重;列表按最近活动排序,超出一屏折叠「显示更多」
- 忽略清单:删除会话记录时把 (agentId, externalSessionId) 记入忽略清单,导入扫描遇到即跳过,防止「删了又被扫回来」;清单只存应用侧,不触碰 agent 数据
- 导入记录的点击行为与「+」新建完全一致:在项目目录拉起该 agent;不构造 resume 命令,续聊由用户在 agent CLI 内自行操作
- 自动续接:自建会话启动后,扫描该 agent 存储回填 externalSessionId;重新打开时若有该 id 且 agent 支持则跑 resumeCommand 续接对话(终端画面不回放);导入会话维持「+」行为
- 大历史首次扫描慢属预期(秒级),扫描期间项目区显示进行中提示
- 回填并发规则:同一 `agentId + 项目目录` 同时最多一个「待回填」会话,并发启动的其余会话不回填、重开原样拉起;同一会话禁止双开(一个会话同时只允许一个活动 PTY,避免两个终端 resume 同一 id 互写;Orca 以 `--fork-session` 分叉解决,我们不搬,直接禁止)

### M5 文件浏览

文件树扫描(忽略 `.git`/`node_modules`/`dist`/`.reference` 等常见目录,遵守项后置)、右侧树渲染、点击只读查看文本内容(大文件截断)、手动刷新。

### M6 Git 面板

status(变更文件列表)、unified diff 渲染(增删行着色)、按文件暂存/取消暂存、提交(branch 现名展示)、本地分支切换。不做的:push/pull/rebase、远端操作。

### M7 打磨与打包

快捷键(新建会话/切换 tab)、等待输入的系统通知(可选)、深浅主题手动切换(默认跟随系统,参考 Orca 实现)、品牌图标替换首字母徽标、electron-builder 打包 Windows 安装包、空态与错误态文案。

## 明确不做(第一版)

注册表 5 个之外的 agent(接入方式 = 新增定义文件)、自由命令输入、PTY 级终端画面回放、非匹配目录的历史会话、i18n、自动更新、远程/SSH、多窗口、插件系统。

## 验证方式

- `tsc --noEmit` 全量类型检查
- vitest 单测覆盖纯逻辑:store-persistence 读写、agent 注册表与检测、git-service porcelain 解析、树扫描忽略规则、状态解析器 fixture 回放(5 个 agent 正/反样本)、**会话扫描器 fixture 回放**(每个 agent 用脱敏真实会话文件样本断言解析结果与 cwd 匹配)
- 每阶段手动冒烟:M1 加目录重启仍在;M2 新建 5 种 agent 会话、交互、关闭重开;M3 各 agent 运行中/提问时状态点正确切换;M4 对装有 claude 的项目目录导入,列表出现历史会话、点击拉起与「+」一致、重复导入不重复;M5 树展开与文件查看;M6 改文件出 diff、暂存提交、切分支;M7 打包产物可安装启动
- git 仓库初始化于 M1,每阶段一 commit(经用户确认后提交)

## 待确认项(不阻塞 M1)

- 新仓库位置:已定 `D:/test/agent-sessions`(目录已建;本计划副本与 AGENTS.md 已写入该目录,新会话交接就绪)
- pi 的发行方式与 antigravity CLI 的本机安装形态:M2 实测(命令名已由 Orca catalog 确认)
- antigravity/pi/kimi 的会话存储路径:M4 在本机核对(续接参数已由 Orca `agent-resume-argv.ts` 确认,五个 agent 全部支持续接)
- 应用图标与产品名:M7 前定即可

## 附录 A:Orca 代码借鉴清单(基于 v1.4.265)

### A1 可直接移植的代码

| 我们的模块 | Orca 来源 | 取舍 |
|---|---|---|
| M2 agent 检测 | `src/main/ipc/command-path/command-path-resolver.ts` | Windows PATHEXT、引号 PATH 剥离、带点文件名精确匹配、env 大小写不敏感——整文件搬;worker 目录读取不搬(规模不需要) |
| M2 agent 检测 | `shared/shell/command-resolution/node-cli-command-resolution` + `shared/concurrency/map-with-concurrency` | `getExecutableNames`、并发探测,配套搬 |
| M2 PTY 生命周期 | `src/main/daemon/pty-subprocess/spawn-environment.ts`、`src/main/ipc/pty/provider/kill-all.ts` | spawn 环境构造、应用退出全量清理模式;daemon/orcad 架构不搬 |
| M2 xterm 容器 | `src/renderer/src/components/terminal/workbench/Terminal` | 每会话常驻 xterm 实例,tab 切换仅切换可见性(单窗口无重连场景,`addon-serialize` 重放不需要);PTY 保活思路保留;pane 拆分/停靠不搬 |
| M4 claude 扫描 | `src/main/ai-vault/scanners/claude/claude-project-dir-encoding.ts` | **整文件搬**:非字母数字→`-`、Windows 大小写、macOS NFC 双编码、长路径 200 字符+hash 桶名匹配 |
| M4 claude 扫描 | `scanners/claude/session-scanner-primary-parsers.ts` | jsonl 解析(id/cwd/title/updatedAt)裁剪 |
| M4 持久化 | `src/main/filesystem/atomic-file-publication.ts` | projects.json 原子写(临时文件+rename);另参考 `file-identity-key.ts`、`merged-directory-link.ts` |
| M2/M4 agent 目录 | `src/shared/agent-launch/catalog/tui-agent-config.ts`、`startup/agent-resume-argv.ts`、`picker/agent-launch-picker-search.ts` | Orca 中央 agent 目录(detectCmd/启动怪癖/trust)照结构重建;**5 个 agent 的 resume 参数构造全有现成实现**;选择器搜索参考 |

### A2 各 agent 借鉴明细

| Agent | 存储位置 | 扫描参考文件 | 状态规则参考 | 特殊坑 |
|---|---|---|---|---|
| claude | `~/.claude/projects/<编码>` | `scanners/claude/`(A1 已列) | `agent-state-rules/claude.json` | 长路径桶名截断 |
| codex | `~/.codex/sessions`(`CODEX_HOME`) | `scanners/codex/` 16 文件:`session-scanner-codex-parser.ts`、`codex-session-root-dedup.ts`、`session-scanner-codex-index-read.ts`、`session-scanner-codex-cached-title.ts` | `codex.json`(屏幕重绘型规则,需转化为流式信号:`openai codex` header、`model:`/`directory:`、`implement this plan?`) | 多 CODEX_HOME 硬链接去重、`.zst` 变体优先级 |
| antigravity | history 文件 + WorkspaceURIs join(IDE 系布局) | `scanners/antigravity/session-scanner-antigravity-history.ts`、`antigravity-session-artifacts.ts`;状态样本 `src/main/runtime/__fixtures__/antigravity-*.json` 全套 | `antigravity.json`(6 条规则) | 会话与 cwd 无直接字段,靠首条 prompt hash 关联;实现顺序放最后 |
| pi | `~/.pi`(`normalizeAgentSessionsDir` 兼容多种写法) | `scanners/session-scanner-graph-parsers.ts`(`parseMessageGraphSessionFile`,一解析器服务 pi/omp/openclaw/prime-agent);`scanners/pi/` 测试含 fixture 工厂 | `pi.json` | 与 oh-my-pi 共享 transcript 格式 |
| kimi | `~/.kimi-code/sessions/<session_*>/state.json` + `session_index.jsonl`(`KIMI_CODE_HOME`) | `scanners/kimi/` 全部 3 文件:paths(从目录布局推导索引,不信任内嵌路径)、parser(readline 流式)、index-cache(索引增量读=缓存思路现成实现) | **hook 观测路线**:Orca 以 `--inject` 注入 hook,turn-start 由 hook 上报(`HOOK_OBSERVED_TURN_START_AGENTS` 含 kimi);屏幕规则文件无 kimi | 会话 id 必须保留 `session_` 前缀 |

M4 建议实现顺序:claude → kimi → pi → codex(去重复杂)→ antigravity(存储形态最特殊)。

已逐条核对的 resume 参数(Orca `agent-resume-argv.ts` 原文):claude `['claude', (--effort), '--resume', id]`;codex `['codex', 'resume', id]`;antigravity `['agy', '--conversation', id]`;pi `['pi', '--session', transcriptPath]`(按转录路径,**Session 须保存 filePath**);kimi `['kimi', '--session', id]`(工作目录作用域,重开须先 cd 到项目目录)。detectCmd 同源核对:claude/codex/pi/kimi(别名 kimi-code)/agy。五个 agent 全部支持续接,启动一律在项目目录 cwd 下执行。

### A3 状态规则结构范式

- 范例:`src/main/runtime/agent-state-rules/*.json`——`rules[]{id, why, priority, when, answer{state, strength}}`,zod schema 校验,bundle 打进应用
- 值得继承的形态:每 agent 一份规则文件、`why` 字段强制写明检测依据、正/反样本 fixture 配对
- 我们的差异:Orca 三源合成(标题观察 + 屏幕规则 + hook 观测),证据分级(hook 权威 > 屏幕强证据 > 弱证据+安静期);我们用「标题事件 + 屏幕快照 + 字节流辅助」三源,照搬其思想(标题优先/地标匹配/安静门槛/证据分级/`why` 纪律/正反 fixture 配对),engine 与规则按新输入源重写
- **hook 通道不搬(2026-11-20 改判)**:Orca hook 子系统(`src/main/agent-hooks/` + `src/main/kimi/`,179 个非测试文件约 2.3 万行)且注入配置侵入用户全局目录(`~/.kimi-code/config.toml`、`~/.pi` 插件文件),影响应用外全部会话,多会话并发下「随会话清理」语义不成立——整体移出第一版,列为将来可选;触发条件:降级状态精度实际不可接受时再评估
### A4 性能优化对照(按规模裁剪)

| Orca 做法(PR) | 我们的取舍 |
|---|---|
| 解析缓存按文件身份命中(#43551) | 抄概念:扫描结果按 路径+mtime+size 缓存;JSON 缓存,不搬 SQLite |
| Codex rollout 读取移出主线程(#43700) | 大扫描走 worker_threads 或分片 yield,预留即可 |
| 流式文本主进程封顶 8MB(#43994)、内存有界(#43456) | 状态解析环形缓冲封顶(如 64KB),PTY 转发不积压 |
| 安静 pane 轮询 750ms→15s(#43901) | 关联回填轮询照抄此节流 |
| 会话保存增量写(#43963/#44784) | 不需要:projects.json 小,整文件防抖 + 原子写 |

### A5 明确不搬

daemon/远程主机/WSL、worktree 模型、native chat 结构化会话、MCP/ACP 协议层、插件与 skills、i18n 机器、ratchet 门禁、云服务。

### A6 文件预览(M5)

主进程读取核心:`src/main/filesystem/local-file-io/`

- `filesystem-file-content-inspection.ts` — `readLocalFileContent`:**单文件句柄完成大小检查、二进制探测、读取**(三者看到同一文件);文本上限 50MB、预览二进制上限 50MB;图片/PDF 按扩展名 MIME 表(`shared/file-preview/file-preview-kind.ts`)+ 文件签名嗅探(`readImageFileSignature`),base64 交渲染层;未知大文件先探前 `BINARY_PROBE_BYTES` 字节(`shared/file-preview/binary-buffer.ts` 的 `isBinaryBuffer`)再决定不整读
- 配套:`local-regular-file-read.ts`(`openLocalRegularFile`/`readLocalFileBounded`/`readLocalFilePrefix`/`fileTooLargeError`)、`local-file-range-read.ts`(offset/length 分页读,大文件截断/懒加载用)

渲染层:

- PDF:`components/editor/pdf/`(pdfjs-dist);图片缩放:`components/editor/viewer-viewport/image-viewer-zoom.ts`;Markdown:react-markdown 栈(Orca 依赖同款)
- 取舍:v1 只做文本只读查看 + 截断(读前 N 字节 + 「文件过大已截断」提示);图片预览用同一 `readLocalFileContent` 返回结构顺手支持;PDF/Markdown 渲染后置

### A6 后补:目录与源码读取方式

- 目录设计四原则:进程边界分层(main 全部 Node 能力 / preload 唯一桥 / renderer 纯 UI / shared 契约)、主进程目录名 = 领域名且目录 = 里程碑、扩展点收敛于 `agents/definitions/`(新增 agent 零框架改动)、契约先行(shared/ipc-contract ↔ main/ipc/channels 一一对应)
- Orca 源码就在当前 worktree(v1.4.265),开发时只读直取;移植深度三档:整文件搬(纯函数无基建依赖)/ 裁剪搬(剥 WSL、execution-host、tracer)/ 模式重写(绑运行时的引擎);移植文件头标注来源(`// Ported from stablyai/orca <path>`,MIT),`// Why:` 注释风格保留

## 附录 B:空目录初始化清单(M1 施工图)

### B0 前置

- 目录:`D:/test/agent-sessions`(空目录,名字可改;写入该路径会触发沙箱写授权,批准即可)
- 环境:Node 24(已确认 v24.14.0)、pnpm(已确认全局 10.17.1 可用)、git 2.46(已确认)、Windows 需 VS Build Tools(C++ 工作负载)+ Python 3(node-pty 与 electron 原生模块编译;2026-11-20 已实测:VS 2022 Community 含 C++ 工具集、Python 3.11/3.12 就绪,node-pty 1.1.0 自带 win32-x64 预编译、安装即用,PTY 实拉 cmd.exe 验证通过)
- 参考源码(只读):项目内完整快照 `.reference/orca-1.4.265/` **已就位**(348MB,完整仓库含全部子工程,无 .git/node_modules,2026-11-20 起随仓库入库以支持换机续做;附录 A 路径按 `.reference/orca-1.4.265/<原路径>` 解析);备用原始仓库 `D:/test/mini-orca`(同一 v1.4.265 提交,本地 tag `v1.4.265` 可锚定任意文件版本)
- 脚手架:`git init` → `pnpm init` → `pnpm create @quick-start/electron`(选 TypeScript + React)生成 electron-vite 骨架 → 按下方清单改造(模板解决 electron-vite 三段构建与 tsconfig 细节,手搭易踩坑)

### B1 根文件清单

| 文件 | 要点 |
|---|---|
| `AGENTS.md` | 项目定位(轻量 agent 会话管理器)、常用命令、工程边界(main 独占 Node 能力 / 渲染层只走 bridge / 新增 agent 只加 definitions 文件)、验证入口 |
| `README.md` | 当前真实状态,不写未实现功能 |
| `.gitignore` | `node_modules/`、`out/`、`dist/`、`.tmp/`、`.review/`、`*.log`、`.DS_Store`(`.reference/` 自 2026-11-20 起入库,不再忽略) |
| `package.json` | scripts:`dev`/`build`/`typecheck`(node+web 两投影)/`test`/`rebuild`(electron-rebuild);engines node 24;packageManager pnpm |
| 依赖 | dependencies:`node-pty`、`simple-git`;devDependencies:`electron`、`electron-vite`、`electron-builder`、`@electron/rebuild`、`typescript`、`vitest`、`react`、`react-dom`、`zustand`、`@xterm/xterm`、`@xterm/addon-fit`、`tailwindcss` + `@tailwindcss/vite`、`@vitejs/plugin-react`、`lucide-react` |
| `electron.vite.config.ts` | main/preload/renderer 三段;`node-pty` 列入 main external;renderer 挂 react + tailwind 插件 |
| `tsconfig.json` + `tsconfig.node.json` + `tsconfig.web.json` | base + main/preload(Node 侧)+ renderer(web 侧,jsx react-jsx) |
| `vitest.config.ts` | environment node,仅跑纯逻辑单测 |
| `electron-builder.yml` | M7 加入 |

### B2 src 文件清单(M1 逐文件,其余按架构树随里程碑生长)

`main/index.ts`(入口)、`main/app-window.ts`、`main/ipc/channels.ts`、`main/ipc/projects.ts`、`preload/index.ts`、`shared/types.ts`、`shared/ipc-contract.ts`、`renderer/src/main.tsx`、`renderer/src/App.tsx`(三栏空壳)、`renderer/src/store/app-store.ts` + `projects-slice.ts`、`renderer/src/ipc/bridge.ts`、`renderer/src/components/ui/` 空态与按钮、`renderer/src/agents-display.tsx`(占位)

### B3 M1 验收

`pnpm dev` 出三栏空窗口 → 添加目录 → store.json 落盘 → 重启列表仍在 → `typecheck`/`test` 绿 → 首个 commit(经确认)

## 修订记录

- 2026-11-20:会话评审后修订——M3 重写(三源输入 + 采样先行 + kimi 降级预案,hook 移出第一版)、A3 通道段改判、A1 xterm 行去 serialize(M2 常驻实例方案)、M4 增补回填并发规则与禁止双开、M5 忽略清单加 `.reference`。依据:Orca hook 子系统 2.3 万行规模与全局配置侵入性;claude/pi 标题信号与 codex/antigravity 屏幕信号已在 Orca 规则文件核实。
- 2026-11-20:采样工具定档——落盘开关随 M2 pty-registry 一起实现,M3 首任务只做采样与规则校准(用户拍板)。
- 2026-11-20:历史与回显职责定档——scrollback 默认 10000 行可配置;不做用户级日志,对话内容永由 agent 自身存储负责;PTY 落盘仅 debug 采样;运行保持归应用、回显归 CLI、关闭后的历史归 resume(讨论定案)。
- 2026-11-20:补会话删除与重命名语义——删除只移除应用记录(确认 + 连带关标签页)、M4 忽略清单防扫回;重命名只改应用侧显示名,agent 侧原名与 id 常驻可查;均不改写 agent 存储(用户确认)。
- 2026-11-20:主题改为支持深浅手动切换(默认跟随系统,参考 Orca 实现),从「明确不做」移出、列入 M7;三栏布局定为左栏与右栏均可隐藏收起(用户拍板)。
