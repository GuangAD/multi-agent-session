# Agent Sessions · 切片

> 2026-11-20 | 状态:已确认

## 任务

- [x] **T1 骨架与项目持久化**
      交付:开发模式出三栏窗口(左栏右栏可收起);添加目录后重启列表仍在;typecheck 与 vitest 全绿
      挡谁:T2、T3、T4、T5、T6、T7、T8、T9、T10、T11(IPC 框架、shared 契约与测试基座是全部后续任务的地基)
- [x] **T2 agent 配置层与安装检测**
      挡谁:T3(建会话需按定义拉起)、T5(状态引擎按 agentId 取规则)、T6、T7(导入按 agentId 找扫描器)、T8(resume 按 agentId 构造参数)
- [x] **T3 PTY 注册表与会话终端**
      挡谁:T4(会话记录与标签页绑定)、T5(状态引擎吃 PTY 数据流)
- [x] **T3.5 shell 底座改造(ADR-0004,变更任务)**
      交付:PTY 跑常驻 shell(cmd),agent 由应用在 shell 内启动;CLI 退出回 shell 提示符可继续交互、可再次进入;Shift+滚轮强制本地滚动(scrollback);shell 命令行注入的转义规则有测试
      挡谁:T4(重开会话形态=新 shell+注入 resume)、T5(exited 语义=PTY 退出)、T8(resume 注入形态)
      对应:ADR-0004;T3 冒烟两项发现(退出后不可交互、TUI 接管滚轮)的修复载体
- [x] **T4 会话记录与侧栏**
      交付:重启后会话列表在;重开原样拉起;重命名/删除(确认+连带关标签页)生效
      挡谁:T5(状态点渲染在会话行)、T7(导入列表挂在会话区)、T8(重开流程接 resume)
- [x] **T5 状态识别三源引擎**
      交付:真实跑 agent 时会话行状态点正确切换(kimi 允许降级);五家正反样本 fixture 回放绿
      挡谁:T11(等输入通知以 waiting 状态为触发)
- [x] **T6 会话导入:框架与 claude/codex**
      交付:对装 claude/codex 的项目导入,历史会话出现;点击拉起与新建一致;重复导入去重;删除后再次导入会重新出现(2026-11-21 重过门 1,ADR-0005)
      挡谁:T7(其余三家适配复用导入框架)
- [x] **T7 会话导入:pi/kimi/antigravity 适配**
      交付:5 个 agent 的历史会话都能导入(存储路径本机实测核对;pi 已实测,claude/codex/kimi/antigravity 本机未装 → 构造/移植样本)
      挡谁:无
- [x] **T8 回填与自动续接**
- [x] **T8 回填与自动续接**
      交付:自建会话重开自动续接对话;并发资格规则与禁止双开生效;五家 resume 参数核对通过
      挡谁:无
- [x] **T9 文件浏览**
      交付:右侧文件树展开浏览,点击只读查看,大文件截断提示
      挡谁:无
- [x] **T10 Git 面板**
      交付:改文件出差异、按文件暂存提交、切本地分支
      挡谁:无
- [x] **T11 打磨与打包**
      交付:Windows 安装包可装可跑;深浅主题切换、快捷键、等输入通知(可选)生效
      挡谁:无

## 依赖

T1 → T2 → T3 → T4 → T5;T2 → T6 → T7;T6 → T8;T4 → T5/T8;T11 依赖 T5(通知)且按计划排最后;T9、T10 仅依赖 T1。实际执行按阶段 4 串行:顺序即编号。

## 遗留项

brief 第 6 节的欠账,排在对应任务内消化:

- pi/antigravity 本机安装形态 → T2 内实测,检测不到则在定义文件覆盖命令
- antigravity/pi/kimi 存储路径核对 → T7 内实测
- kimi/antigravity 等输入识别精度 → T5 采样校准后定,最坏走降级预案
- 应用图标与产品名 → T11 开始前由用户定,未定则打包用占位

## 开发记录

- 2026-11-20 08:30 | 开工前接口预检(通过;两处契约级登记,无停手项,BASE=8964391)
  - 跨任务接口逐项核对:T1 产 shared/types.ts(Project/Session/Settings/IgnoreEntry/AppStore/SessionRunState/AgentId)与 loadStore/saveStoreAtomic/DEFAULT_STORE → T2 消费 AgentId ✓;T2 产 agentRegistry + AgentDefinition(shared/agents.ts 落点归 T2,T1 不建)与 resolveCommandPath → T3 消费 def/spawn 形状 ✓;T3 产 ptyRegistry/buildSpawnArgv/samplingTap(env AGENT_SESSIONS_SAMPLE → <dir>/<sessionId>.bin)→ T4/T5 消费 ✓;T4 产 sessionRecords CRUD(改传入 store + saveStoreAtomic)→ T6 runImport(store,…)/T8 回填消费 ✓;T5 产 createTracker(state:changed)→ T11 通知消费 SessionRunState ✓;T9/T10/T11 通道与 shared/ipc-contract 一一对应,TreeNode/GitStatus/Settings.theme 均在 spec 定义内 ✓
  - 测试命令可解析性:T1 步骤 2 含 vitest 基座创建(include src/**/*.test.ts);各任务测试文件均与源码同目录 *.test.ts,过滤命令全为文件/目录路径过滤(T6/T7 目录级),无 -k 模式;全部 Expected 均写明跑测条数;累计链 5→15→19→24→35→50→55→65→70→82→86 与门 2 的 86 用例逐级吻合 ✓
  - 登记一:spec 接口面清单列 sessionRecords.get,T4 契约未列——按 spec 补入 T4 实现(不经 IPC 直查 store),覆盖矩阵 5 用例不变
  - 登记二:spec 接口面清单 BackfillCoordinator(claim/resolve/release)与 T8 契约(claim/poll/release)命名不一致——resolve≈poll 同义,以 T8 契约为准
  - 另:controller 补充约定——T1 建 .gitignore 时除模板条目外含 .reference/、.tmp/、.review/(评审 diff 不入历史,code-review 技能要求);不改四层文档结论
- 2026-11-20 17:35 | T1 开发与评审闭环(代码就绪,待手动冒烟 + 确认提交)
  - implementer(worker subagent)按契约完成:模板 @quick-start/create-electron@1.0.31 并入、storePersistence 接缝 TDD 红→绿(5 用例)、projects IPC 三通道 + preload 桥 + projects-slice + 三栏空壳(左右可收起);未提交、未动文档、零越界(git status 38 条与报告清单逐项一致)
  - controller 亲跑验证:typecheck 双投影 exit 0;vitest 目标/全量绿;build exit 0;lint exit 0
  - 首轮评审(reviewer subagent,对照 .review/T1.patch 1062 行):规格符合 ✅,无 Critical,无夹带无误解;1 Important——saveStoreAtomic 固定共享 <file>.tmp 并发互踩;5 Minor(version 无条件覆盖、入口 rejection 未接住、渲染层 IPC 失败无处理、盘根 name 空串、.editorconfig 末行无换行)——记录,不阻塞
  - Important 修复(原 implementer,只动接缝两文件):per-call 唯一 uuid tmp + 失败 best-effort 清理 + 接缝内同文件保存队列(Windows 并发 rename 覆盖同目标瞬时 EPERM,唯一名治不了,队列结构性消除;controller 裁决接受——串行化落接缝正是意图);新增并发守卫用例(8 写者×3 轮,断言完整内容 + 无残留);mutation check:退回固定 tmp 第 1 跑即红且仅守卫转红 → 还原 6 passed ✓;修复后 controller 复跑全绿(6 passed/typecheck/lint)
  - 复审(reviewer :low 档,对照 .review/T1-fix.patch):Important-1 ADDRESSED,无新增 Critical/Important,裁决可提交;新增 Minor——saveQueues Map 只增不减(留 T4 复用接缝时顺手自清);范围外观察 2 条(无 fsync,掉电级原子性属设计取舍;队列下守卫并发形态部分退化但守卫仍有效)
  - 口径登记:契约步骤 2「空基座 no test files found」未单独执行(install 与写测试时序重叠,配置可加载性由红跑证实,接受);electron-builder 相关剔除(M7 才接,build 重定义为 typecheck && electron-vite build);eslint ignores 补 .reference/.tmp/.review;窗口尺寸沿用模板 900×670
  - 下游结论(T2+ 用):main/preload 产物 CJS,__dirname 可用,HMR 逻辑在 app-window.ts;node-pty 归 T3 装 dependencies(implementer 原文误记为 T2);引 shared 的相对路径深度易错(typecheck 抓过两处);store 生命周期 = 入口 loadStore(userData/store.json) 持有内存对象,IPC 域原地改 + saveStoreAtomic 即时落盘,T4 直接复用;saveStoreAtomic 已并发安全(唯一 tmp + 队列),调用方无需自行加锁
  - 文档变更登记:本轮无四层文档实质改动(plan.md 预检与本章为 controller 记账)
  - 冒烟阻塞修复(controller,2026-11-20 17:36):用户首跑 pnpm dev 报「Error: Electron uninstall」——pnpm 10 默认拦截依赖构建脚本,模板并入时漏了 pnpm.onlyBuiltDependencies,electron postinstall 未跑、dist/ 二进制缺失。修复:package.json 补 "pnpm":{"onlyBuiltDependencies":["electron"]},node install.js 手动补跑下载(T3 装 node-pty 时按契约补同名白名单);vitest/typecheck/JSON 校验复核通过
  - T2 开工口径(controller):契约步骤 1 的两个配套纯函数(getExecutableNames、map-with-concurrency)落点定为 src/main/command-path/(与 resolver 同目录——command-path 领域的配套探测件,不设通用 utils 目录,符合工程边界);评审 diff 生成用 git add -N(intent-to-add),commit 时已归一
  - 已提交 bcf21d2f3628(38 文件 +4688 行;手动冒烟与 commit 均经用户确认 17:40);T2 BASE=bcf21d2
- 2026-11-20 18:05 | 变更登记:`.reference/`(Orca v1.4.265 快照,348MB／38043 文件)纳入仓库并推送远程 `GuangAD/multi-agent-session`(用户明确要求,支持换机续做)——同步修正 AGENTS.md 工程边界与 PLAN.md B0/B1 中「已 gitignore 不提交」的表述;四层文档(brief/plan/spec/tasks)结论未变,仅工程边界描述同步实况
- 2026-11-20 | 变更登记:门 2 评审增补——不支持预览的类型与项目目录支持「通过 VS Code 打开」(code 命令优先,未装回退系统默认应用),落 T9,非接缝不加用例(用户提出)

- 2026-11-20 20:51 | T2 开发与评审闭环(冒烟经用户确认 20:51,已提交 0814aa94)
  - implementer(worker subagent)按契约 TDD 完成:resolver 整文件移植 + 配套纯函数(getExecutableNames/forEachWithConcurrency/directoryNameKey/readDetectionDirectory,落 src/main/command-path/ 同目录)、agent-registry(register/getById/list + 五定义自注册)、五份定义文件(状态规则初版指向 Orca agent-state-rules json 信号要点,kimi degraded:true,sessions 一律留空位保证 IPC 结构化克隆)、agents:list IPC(forEachWithConcurrency 限 4 按索引回填保序)、NewSessionMenu + AgentBadge;未提交、未动文档、零越界
  - controller 亲跑验证:typecheck 双投影 exit 0;vitest 全量绿;git status 与报告清单逐项一致
  - 首轮评审(reviewer subagent,对照 .review/T2.patch 860 行,逐行对照 Orca 原件 4 件):无 Critical;规格符合 ❌ 仅 1 处——Important:resolver 非 win32 分支误用 PATHEXT 语义(原件两路径一律 [''],裸命令名在 POSIX 宿主永远探不到);Minor 3(溯源措辞失准、原件 PATH 条目 trim 变体未保留[记录即可]、NewSessionMenu 无 .catch[T3 接线时顺手补])
  - Important 修复(原 implementer,只动 resolver 与其测试):非 win32 分支改 options.exts ?? [''];守卫用例(platform 注入 linux + POSIX 裸名命中,ResolveCommandPathOptions 增 platform 可选项);mutation check:回退 PATHEXT 语义 → 守卫用例红(expected null not to be null,裸名无 '' 扩展)→ 还原 6 passed;复审(reviewer glm-5.3-flash:low 档)两发现均 ADDRESSED,无新增问题,裁决可提交
  - 契约/口径登记:① resolveCommandPath 落为 Promise<string | null>(readDetectionDirectory/stat 异步,契约同步记法不可兼得,Orca 原件即 async);② ResolveCommandPathOptions 增 platform 注入(原件同款,守卫用例服务);③ 「检测只走 PATH」收窄裁定接受——Orca 的 install-dir 兜底(~/.local/bin、AppData npm 目录等)未移植,新装 agent 需重启应用才可见,定义文件覆盖命令兜底(backlog 备忘);④ screen 地标挂 working 槽(spec 的 AgentStateRules.screen 无 idle 槽),T5 采样校准时复核;⑤ getWindowsBatchDetectionExtensions(批检测扩展集 = PATHEXT ∪ 字面可执行名)系原件原生 agent 兜底,并入 resolve
  - 测试基线口径:契约步骤 10「15 passed」系门 2 时点数——T1 评审阶段加 1 并发守卫(6 条),T2 复审后加 1 POSIX 守卫(11 条),全量实为 17 passed
  - 冒烟阻塞修复(controller):pnpm dev 报「Error: Electron uninstall」复现——node_modules/electron/dist 与 path.txt 缺失(postinstall 未跑成,白名单已在 package.json),node node_modules/electron/install.js 手动补跑后正常;手动冒烟经用户确认通过(选择器 5 agent,pi 已安装、其余置灰)
  - pi 疑点(留 T3):检出 C:\Program Files\nodejs\pi(npm 全局 shim),用户未确认是否 Pi coding agent 本尊;T3 建会话实测,异常则在 definitions/pi.ts 覆盖命令(遗留项承接)
  - 本机探测(供 T3/T6 参考):仅 pi 检出;claude/codex/agy/kimi/kimi-code 均未检出
  - 下游结论(T3+ 用):渲染层 components/sidebar 引 shared 需 ../../../../shared(比 App.tsx 深一级);resolveCommandPath 返回可能正斜杠混排,T3 构造 spawn argv 需规整外观时自行 path.win32.normalize,不改移植件;forEachWithConcurrency(限 4)在 ipc/agents.ts 有现成用法;MSYS 的 TZ=Asia/Shanghai date 输出异常,记账时间用 node Date + timeZone 交叉取
  - 文档变更登记:本轮无四层文档实质改动(本条与勾选为 controller 记账)
  - 已提交 0814aa94(20 文件 +725/-6;T3 BASE=0814aa9)
- 2026-11-20 21:55 | T3 开发与评审闭环(冒烟经用户确认,已提交 02ca380e)
  - implementer(worker subagent)按契约完成:node-pty 1.1.0/@xterm/xterm 6.0.0/@xterm/addon-fit 0.11.0 入 dependencies;buildSpawnArgv/samplingTap 接缝 4 用例 TDD 红→绿;ptyRegistry 编排(spawn/kill/killAll/事件转发/采样句柄三路关闭)与 pty:* IPC;渲染层 TerminalTabs/TerminalView/use-terminal(Map 常驻 + 单一数据泵)+ sessions-slice 内存态 + NewSessionMenu 接线;before-quit 调 killAll;未提交、零越界
  - controller 亲跑验证:typecheck 双投影 exit 0;vitest 21 passed;electron-vite build 通过(node-pty 保持外置);git status 与清单逐项一致
  - 首轮评审(reviewer subagent,对照 .review/T3.patch 1494 行):规格符合 ✅,无 Critical;Important 2——采样 WriteStream 无 error 监听(坏目录崩主进程 + 全部 PTY 孤儿)、spawn→xterm 注册间启动输出丢失窗口;Minor 4(create await 不在 try、spawn 无重复 id 防护、字节流 UTF-8 往返衰减[记录]、scrollback 异步到达触发终端重建[记 T-settings 约束])
  - Important 修复(原 implementer):Fix-1 error 监听 + 采样降级停用(守卫:坏目录 → uncaughtException 计 0;mutation:移除监听 → 红因精确指向 ENOENT 逃逸)✓;Fix-2 泵内 pending 暂存 + openTerminal 注册即 flush + closeTerminal 清理(守卫 2 条 + 附加变异验清理路径)✓;Fix-3/4 顺手修;复审(reviewer glm-5.3-flash:low)4 项全 ADDRESSED、无新增,可提交
  - 契约外增补登记(机械必要,已裁定接受):pty:spawn/pty:kill(契约步骤 7 明文渲染层触发 spawn/kill)、settings:get + src/main/ipc/settings.ts(scrollback 取 settings 明文)、projects-slice selectedProjectId(新建链路需目标项目,T4 重组侧栏时消化);spawn 落 Promise<void>(resolveCommandPath 异步,沿 T2 异步先例)
  - 实测结论(implementer 台架):node-pty 在 Windows 必须交解析后绝对路径(裸命令名 CreateProcess 抛 File not found);.cmd shim 交绝对路径直拉即可,无需 cmd /c 包装;electron-vite v6 外置只能走 build.rollupOptions.external(顶层 external 字段已不存在)
  - pi 疑点闭环(用户冒烟确认):C:\Program Files\nodejs\pi 即 Pi coding agent 本尊,definitions/pi.ts 不改
  - 冒烟发现与定性(用户反馈两项):①pi 退出后终端不可再交互——T3 形态固有(PTY 直接跑 agent,进程死即条目删),修复载体=T3.5;②pi 运行时无法滚动——pi 为全屏 TUI(交替屏 + 鼠标上报)接管滚轮,属 TUI 固有行为,兜底(Shift+滚轮强制本地滚动)落 T3.5;用户拍板先提交 T3 再做 T3.5
  - 变更登记(shell 底座,用户在 T3 评审期提出):PTY 常驻 shell、agent 在 shell 内启动、CLI 退出回 shell 可再交互——落 ADR-0004;CONTEXT.md 标签页条目就地修订;spec.md 五处修订(整体实现段、SessionRunState 注释、pty:spawn/pty:kill/settings:get 三通道增补、pty:exit 语义注释、pty-registry 模块行);plan.md 任务清单追加 T3.5;不触 brief 决策,按回退协议直接登记不重过门
  - 测试基线口径:契约步骤 8「19 passed」系门 2 时点数——T2 后基线 17,T3 接缝 4 条 = 21;评审修复新增守卫 3(Fix-1 ×1、Fix-2 ×2)= 24 passed(5 文件)
  - 下游结论(T3.5/T4/T5 用):pendingData 对「已 spawn 未 open」会话无上限累加(终审评估加上限);采样写盘原始字节追加无 UTF-8 往返衰减,数据泵整段字符串直灌 xterm;TerminalView effect 依赖 [sessionId, scrollback],设置变更会重建实例(暂存会 flush 进新实例不丢);msys 的 TZ 变量不可信,记账时间一律 node Date + timeZone
  - 文档变更登记:本轮含实质变更(shell 底座)——CONTEXT.md/spec.md/plan.md/ADR-0004 四处,随本任务 docs commit 入库
  - 已提交 02ca380e(代码);T3.5 BASE=02ca380e
- 2026-11-21 00:30 | T3.5 冒烟迭代登记(shell 底座功能达成,样式问题记录待深挖)
  - 用户冒烟确认:窗口缩放实时跟随 ✓;pi 退出回 shell、dir 回显、再进 pi ✓;应用整体不再出滚动条、终端继承高度(布局四处 min-h-0/overflow-hidden 修复,controller 会话内直修 App.tsx)✓;**pi 里滚轮已能翻历史**(滚轮→翻页键转发)✓
  - 滚轮问题诊断链(留档):采样实锤 pi 交替屏(?1049h 无 ?1049l)且鼠标模式序列缺失 → TERM 注入(xterm-256color/truecolor,Ported Orca spawn-environment)使 pi 开了 focus reporting(?1004h)但鼠标三件套仍缺 → 判定 Windows ConPTY 不透传鼠标模式序列(xterm 端 mouseTrackingMode 恒 none),滚轮直达 pi 不可行 → 采翻页键转发(交替屏+非 mouse mode 下滚轮→PTY 写 PageUp/PageDown;pi 源码 chunk-4EYXVSA5 实证其 tui.altScreen.pageUp/pageDown 绑定与 parseWheelEvent/routeWheel 完整滚轮支持)
  - xterm 6.1.0-beta.336 升级(对齐 Orca 同版):上游 6.0.0 有 alt buffer 滚轮回归(vscode#331756 等佐证),升级后 shell 滚动正常;@xterm/addon-fit 同步 0.12.0-beta.332
  - **遗留问题(用户不接受现状,要求详细调研 Orca 后重做)**:①滚动条错位(pi 运行中,截图 pi-clipboard-668de77d);②终端右侧空白依旧;③滚轮→翻页键是权宜方案(整页步长、非鼠标模式),期望对齐 Orca 的真实实现。待调研点:Orca spawn env 全貌(除 TERM 外的能力信号)、node-pty spawn 参数差异(ConPTY 配置)、pane 渲染架构(headless emulator + serialize 重放 vs 我们的直挂 xterm)与滚动条样式、fit/空白处理
  - 布局修复与 xterm 升级为本轮已确认有效改动,随 T3.5 提交;样式三问题不阻塞提交但登记为后续任务输入
- 2026-11-21 | T3.5 样式问题暂停:用户不接受方案,要求重开会话讨论**
  - 本轮已解决并验证(不得回退):滚轮在 pi 内可用(ConPTY 透传鼠标模式 + 鼠标报告放大)、窗口缩放跟随(ResizeObserver 稳定帧)、应用整体不出滚动条与终端继承高度(min-h-0 链)、DOM 几何对齐(container=.xterm=viewport=351px,screen=344px)、spawn 初始尺寸=真实 fit 提案(Fix-A/B,含 resolvePtyFirstSize 兜底 120×40)
  - 未解决:pi 运行中右侧空白带 + pi 自绘滚动条错位。全链路已实证到 pi 感知 resize 为止(xterm 重算/IPC/ConPTY 缓冲均正常;pi 在 Windows ConPTY 下收不到 stdout resize 事件),但**即使 spawn 尺寸正确,pi 内容仍比终端窄约 5-6 列**,残差待查
  - **完整问题记录与实证数据见 docs/issues/2026-11-21-terminal-rendering.md**(含三段可疑方向:H1 xterm 6.1 viewport 上游补丁未移植 / H2 双滚动条并存 / H3 pi 自绘滚动条占列)
  - 状态:T3.5 改动全部留在工作区**未提交**(typecheck 0 error,vitest 75 passed/10 files);下个会话据此文档继续讨论方案
  - 方法论教训:本轮多轮「改动—冒烟—被打回」源于在渲染管线上逐个试参数(TERM/env/CSS/fit/尺寸)而未先做 DOM 级定量定位;下轮应先建立「pi 内容右界 / xterm 右界 / 滚动条槽」三者的像素级对照,再改代码
- 2026-11-21 04:43 | T3.5 终端右侧固定空白带根因闭环:字体度量不一致
  - 现场 DOM 定量:122 列时文本最后字符只推进到屏幕约 88%,xterm 网格按 8px/格计算而 DOM 文本按 7px/格推进;空白随列数线性增长,不是旧 spawn 尺寸或 shell 差异
  - 根因:当前 Terminal 使用 xterm 默认 `fontFamily:'monospace'`,canvas 测量与 DOM 渲染回退字体不一致;Orca `pane-terminal-options.ts` 显式设置完整字体族/14px/300/500,无此问题
  - 修复:`src/renderer/src/components/terminal/use-terminal.ts` 移植 Orca 字体族/字号/字重常量;新增回归测试校验 Terminal 选项
  - 验证:`pnpm typecheck` 0 error;`pnpm test` 76 passed/10 files;现场放大窗口并重启 pi 后分隔线落到末列,空白只剩 pi 自绘滚动条 1 列 + xterm 7px 沟槽
- 2026-11-21 04:43 | 文档同步:AGENTS.md 增终端外观配置约束,问题档案第七节记录后续主题/终端配置接入规则

- 2026-11-21 12:53 | T3.5 闭环(shell 底座 + 终端渲染问题全部解决)
  - 交付达成:PTY 跑常驻 cmd、agent 注入启动;pi 退出回 shell 提示符可继续交互、可再进 pi;窗口缩放实时跟随;应用整体不出滚动条、终端继承高度;pi 内滚轮可用;pi 界面右侧空白带消除
  - **空白带/滚动条错位最终根因(用户定位)**:Terminal 用 xterm 默认 `fontFamily: monospace`,canvas 测量与 DOM renderer 回退到不同字体度量 —— 122 列时网格按 8px/格、文本按 7px/格推进,末列只到屏幕约 88%,空白随列数线性增长。修复:按 Orca `pane-terminal-options.ts` 同款显式设置字体族/fontSize 14/fontWeight 300/fontWeightBold 500,canvas 与 DOM 同一套度量 + 回归测试钉住 Terminal 选项;实测 122 列下末字符 Range 右缘与 screen.width/cols 一致
  - 本轮其余落地(均有守卫或台架):CONPTY 透传鼠标模式(useConptyDll:true → 采样出现 ?1000h/?1002h/?1003h/?1006h,pi 滚轮走鼠标报告路径)、鼠标报告放大(mouse-wheel-replay/tui-wheel-reports 移植)、滚轮四分支(Shift 本地 / mouse 模式重放 / 交替屏翻页键兜底 / 默认交 xterm)、孤儿树杀(killProcessTree:PowerShell CIM 后备树快照 + taskkill,跨控制台子进程台架)、StableCellFitAddon + terminal-grid-size-for-box 移植、terminal.css(.xterm-container calc + contain:paint、.xterm 100%、viewport overflow-y:scroll、滑块圆角)、scrollbar-sleek.css、xterm 6.1.0-beta.336 + addon-fit 0.12.0-beta.332(对齐 Orca)、布局 min-h-0 链、spawn 初始尺寸=真实 fit 提案(resolvePtyFirstSize + 先开 tab 后 spawn)
  - 测试基线:76 passed / 10 files;typecheck 双投影 0 error(controller 亲跑复核);mutation check 均留痕(resolvePtyFirstSize 兜底、滚轮四分支、树杀、spawn 尺寸透传、sessions-slice 一次性消费与失败撤 tab)
  - 诊断链路留档(docs/issues/2026-11-21-terminal-rendering.md 三~六节):xterm 重算 ✅ / resize IPC ✅ / ConPTY 缓冲 ✅(mode con 报 160 列)/ pi 感知运行期 resize ❌(nodejs#13197 域,pi 用启动宽度)/ **真因=字体度量不一致**;排除项:PowerShell vs cmd、旧 pi 进程、H1(xterm patch)/H2(双滚动条)/H3 单独作用
  - 文档变更登记:AGENTS.md 新增工程边界条「终端外观配置:xterm options 单一来源、度量类变更须 refit 并同步 PTY 网格、颜色类不 refit」;新增 docs/issues/2026-11-21-terminal-rendering.md(六节定位 + 七节后续约束);本 plan 勾选 T3.5 与本章记账
  - 方法论教训(本轮真实代价):多轮「改参数—冒烟—被打回」源于未先做像素级定量定位;正确顺序是先量「网格 cell 宽 vs 实际文本推进宽」(Range API/canvas measureText),再改配置
  - 下游结论(T4+ 用):Terminal 构造必须显式传字体四项,勿依赖 xterm 默认;颜色类配置可运行时更新不 refit,字体类必须 refit + onResize→pty:resize 同步;pty:spawn 载荷已含 cols/rows(渲染层 fit 提案,缺省/非法回退 120×40);sessions-slice 新增 spawnOnTerminalReady(pendingSpawns 一次性消费,失败撤 tab)
  - 已提交 d56117fc(代码 25 文件)+ 0eeff90b(文档 5 文件;含 AGENTS.md/PLAN.md/plan.md/issues/T3.5 契约);工作区干净(仅 .reference 下快照自带的 4 个 .gradle 未跟踪目录);T4 BASE=0eeff90b
- 2026-11-21 13:41 | T4 开发与评审闭环(冒烟经用户确认 13:41,代码 commit 待确认)
  - BASE=c4dceeec(docs 提交,比上一轮登记的 0eeff90b 多一个文档提交;diff 基线以 HEAD 为准)
  - implementer(worker subagent)按契约完成:`session-store/session-records.ts` 接缝五条(create/rename/remove/listByProject + 按 spec 补 get);`ipc/sessions.ts` 重写为 `registerSessionsIpc(store, storePath)`(create 经注册表归一 + 组合层补 def.name / rename / remove / open 更新 lastOpenedAt / list),模块内 100ms 尾沿防抖保存器;`pty:*` 侧仅加只读 `ptyRegistry.activeSessionIds()`;shared 契约 +4 通道 +SessionsApi 4 方法,preload 同步;渲染层 TabSession 收窄为 `{ sessionId, runState }` + sessions 记录列表/loadSessions/reopenSession/renameSession/removeSession;新增 sidebar/{Sidebar,ProjectGroup,SessionRow} 与 ui/confirm-dialog;App.tsx 改用 Sidebar(先 loadProjects 再 loadSessions);TerminalTabs 元数据改从记录取。未提交、未动四层文档、零越界(16 文件:10 改 + 6 增,与报告清单逐项一致)
  - controller 亲跑验证:typecheck 双投影 0 error;vitest 82 passed/11 files(修前 81/11);electron-vite build exit 0;eslint 作用域内仅 1 error(sessions-slice.test.ts:42,`git show HEAD:` 核实逐字未改,属既有)
  - 首轮评审(reviewer subagent,对照 .review/T4.patch 1120 行):规格符合 ✅,无 Critical;Important 2——①防抖落盘无退出前 flush(删除/重命名后 100ms 内退出会丢,重启已删会话复活)②upsertSession 追加到末尾与 listByProject 倒序不一致(新建停底部、重启跳顶部);Minor 8(重复删除分支无用例、title 无校验、confirm-dialog 无 Esc/焦点管理、removeSession 的 closeTab 无 try/catch、spawn 失败留记录、localeCompare 并列序、lastOpenedAt 绕过 sessionRecords、onBlur 与 Escape 交互可疑)
  - Important 修复(原 implementer,只动 4 文件):①`createDebouncedSaver` 返回 `{schedule, flush}`(dirty 标记 + writing 队尾链,flush 既写待写变更也等飞行中的写),`registerSessionsIpc` 透传 flush,index.ts 用 quitPhase 状态机在 before-quit 里 preventDefault → await flush → killAll → app.quit,重入直接放行;②upsertSession 改 `[session, ...sessions]` 前插 + 既有 sessions-slice.test.ts 内补 1 条守卫用例(手写数组字面量期望),mutation check:改回追加 → 该用例转红(expected 's-older' to be 's-newest')→ 还原 6 passed ✓
  - 复审(reviewer magpie/zhipu/glm-5.3-flash:low,对照 .review/T4-fix.patch 199 行):两条均 ADDRESSED,无新增 Critical/Important,裁决可提交;范围外观察:收尾期间取消退出会让 quitPhase 停在 cleaning(语义无害)
  - TDD waiver(留痕):发现 1 的修复无守卫用例——测退出 flush 需让 vitest 加载 electron 或新开接缝,契约口径明确「不得为防抖新开接缝」;改由手动冒烟覆盖(删除/重命名后立刻关应用 → 重启不复活/不回退),用户冒烟通过
  - 口径登记:①契约步骤 5「24 passed」系门 2 时点数,实况基线 76/10,本轮期望改为 81/11,修复后 82/11;②首红形态与契约「5 failed」不符——模块尚不存在时是套件导入失败(0 test),未用桩文件伪造 5 failed,用两次 mutation check 证明断言有效;③spec 接口面清单的 `sessionRecords.get` 按预检登记一补入,不加用例;④`sessionRecords.create` 的 title 默认写 agentId、显示名由 IPC 层 rename 补(spec 禁止领域模块横向 import),IPC 层因此多一次 store 变更(同一防抖窗口内合并落盘)
  - 文档一致性清理(controller,随本轮 docs 提交):plan.md 任务清单 T2/T3 各有一条重复的未勾行(同一事项两个状态),删多余未勾行,保留 [x];不改章节结论
  - **已知空白(留待裁决,未实现)**:①`projects:remove` 不清理该项目 sessions,孤儿记录留在 store,重新添加同目录会生成新 projectId 使旧记录永不可见;②删除会话不登记忽略清单(依赖 externalSessionId,归 T6)
  - **既有测试顺序依赖(非本轮引入,已修)**:`--sequence.shuffle` 下复现两处——①`src/main/pty-registry.test.ts` samplingTap 坏目录用例断言「摘除后同会话不得再尝试写」;②`use-terminal.test.ts`「tab 关闭清理 pending」。根因均已查实:①该断言数 `console.error` **总调用数**,而同文件树杀是 fire-and-forget,其异步日志(「taskkill 兜底未命中」「树杀快照失败」)会落进本用例 150ms 等待窗(DIAG 捕获实况:5 条调用里 4 条是这两类)②该用例默认前一用例已挂数据泵,单跑/乱序时 `onPtyDataHandlers` 为空(`pump is not a function`)。修法只改用例不动产品代码:①改按本模块固定消息过滤计数 ②用例自带引导终端(open 再 close)后取泵。验证:目标两文件 shuffle 10 轮 31 passed ×10、全量 shuffle 3 轮 82 passed ×3、常规顺序 3 轮 82 passed ×3、typecheck 0 error
  - mutation check(留痕,含限制):①用例自带引导能否定序复现——删掉引导后单跑该用例即 `TypeError: pump is not a function`(1 failed / 18 skipped),加回转绿;②过滤计数一条**无法定序复现**(改回总数后 28 轮 shuffle 未再红,原缺陷在当时的出现率约 1/8),故其证据是修复前的 DIAG 实况调用清单 + 修复后 10/3 轮全绿,不作为可脚本重放的变异证据;③现有两处均已留 Why 注释说明为何这样写
  - 下游结论(T5+ 用):①「有活动标签页」在主进程侧判据是**有存活 PTY**(`ptyRegistry.activeSessionIds()`),与渲染层「有 tab」在 shell 退出后不等价——T5 状态点、T8 禁止双开必须明确取哪一个;②`sessions:open` 已更新 lastOpenedAt 并落盘,T8 接 resume 只需在此注入 argv 决策并让渲染层透传,不另开通道;重开与新建共用同一条 Fix-B 时序(pendingSpawns → 首个 fit → 带 cols/rows spawn);③侧栏与标签页的元数据唯一来源是 `sessions` 记录,任何新 UI 不得往 TabSession 塞元数据;④记录顺序契约是 createdAt 倒序,渲染层 upsert 必须前插与之对齐
  - 文档变更登记:本轮四层文档无实质变更(brief/spec/tasks 未动;spec 新增接口 `sessionRecords.get` 系预检已登记项);AGENTS.md/CONTEXT.md/ADR 无改动;plan.md 仅勾选 + 本章 + 重复行清理
  - **提交状态**:已提交 e4e815b1(代码 16 文件)+ 11dcea66(用例顺序依赖修复 2 文件,用户指定当场单开 fix commit)+ 本条 docs 提交;T5 BASE=11dcea66;review diff `.review/T4.patch`、`.review/T4-fix.patch` 已删
- 2026-11-21 17:02 | T5 开发与评审闭环(冒烟经用户确认,代码待确认提交)
  - BASE=11dcea66;本任务全部改动与冒烟修复合并为一个 feat 提交(任务未提交前冒烟发现的缺陷属该任务闭环,不另造「已知坏」的中间提交)
  - implementer(worker subagent)按契约完成:`agent-state/state-parser.ts` 接缝(createTracker + Tracker 五方法;判定链 退出 > waiting 地标 > working 信号 > 标题规则 > 静默 idle;64KB 字节环形缓冲跨 chunk 匹配;300ms 去抖;degraded 档;地标子串大小写不敏感);`__fixtures__/` 五家事件序列样本;新增编排层 `ipc/state.ts`(tracker 表 + 三路喂食 + state:changed 广播;契约落点增补,已授权);`shared/ipc-contract.ts` 增 `state:title`/`state:snapshot` 上行 + `state:changed` 下行 + `StateApi`,preload 同步;`use-terminal.ts` 只追加(标题上行 + 250ms 窗口快照序列化 + closeTerminal 解绑);渲染层 `run-state-slice.ts` + `run-state-display.ts` + SessionRow 状态点(绿/橙/灰/红);与 T4 收敛:删除 `TabSession.runState`/`markSessionExited`,运行状态唯一来源=run-state-slice,App.tsx 改订阅 state:changed
  - **working 信号的读法(implementer 提出,controller 认可)**:`screen/bytes.working` 地标只在输出流动时算 working,安静达门槛后同一地标视为「就绪画面」交给标题/安静判定(与 Orca 各家 ready 规则的 requiresQuiet 同构;否则 codex/antigravity 的常驻横幅会永远 working)
  - controller 亲跑验证:typecheck 双投影 0 error;vitest 93 passed/12 files(修前基线 82/11);eslint 作用域内 0 新增 error;T3.5 的 use-terminal 19 条仍绿
  - 首轮评审(reviewer subagent,对照 .review/T5.patch 1457 行):规格符合 ✅,无 Critical;Important 2——①`bytes.waiting` 是一次性证据且无出口(字节缓冲是会话开始以来的只增日志,waiting 分支在最前且不设安静闸门 → 地标一旦流过即永久误报,填上 bytes 规则就会炸)②`exited` 也走 300ms 去抖且退出路径先摘 tracker(尾包会 resurrection 出新 tracker 播种 idle,红点翻灰);Minor 6(快照节流注释与实现不符、空画面不上行致 lastSnapshot 陈旧、「!quiet 闸门无用例钉住」、serializeVisibleLines 无覆盖、runStates 不清理、TrackerOptions.now 无用例)
  - Important 修复(原 implementer):①`onSnapshot` 收到快照即 `byteBuffer = ''`(快照是更强更新的证据,到达即宣告更早字节证据过期;跨 chunk 拼接在两次快照之间照旧)+ 用例 12/13(测试本地构造 def,跨 chunk 拼接 + 快照后不再 waiting)②`onExit` 抽出 `publish()` 直接落地不进去抖、`create(sessionId, {seed})` 显式表态播种、`trackerForPty` 加「有活动 PTY」守卫、退出路径 `{seed:false}` 自建;用例 9 改为不推进定时器即断言 exited;③codex fixture 补 `ready-header` 的 2600ms idle 检查点钉住 `!quiet` 闸门;三条 mutation check 均留痕(删 byteBuffer 清理→13 红/改回 requestState→9 红/删 !quiet→2600 红,均还原全绿)
  - 复审(reviewer magpie/zhipu/glm-5.3-flash:low,对照 .review/T5-fix.patch 238 行):三条均 ADDRESSED,无新增 Critical/Important,裁决可提交;新增 Minor 挂账:`trackerForPty` 每包一次 O(n) `activeSessionIds().includes`
  - TDD waiver(留痕):`ipc/state.ts`(import electron)的 seed 分支、活动 PTY 守卫、退出路径自建无单测——要覆盖需先建 fake ipcMain/window/ptyRegistry,属独立任务;implementer 用两条代码事实支撑(`entries.delete` 先于 exit 监听器、`entries.set` 先于 onData 注册),controller 核对其一
  - **冒烟发现并修复(实证驱动,非试错)**:pi 会话状态点永远停在 idle。根因 = `title.working: /^π ⠋/` 在本机 **pi 1.5.0** 永不命中——读安装包实证:标题唯一写入是 `updateTerminalTitle()` → `π - <session> - <cwd>`(APP_TITLE="π"),干活信号在屏幕上:Loader `DEFAULT_FRAMES`(U+280B…U+280F,80ms 一帧)+ `defaultWorkingMessage="Working"`;pi 不做逐工具授权(docs/security.md),唯一阻塞对话框是项目信任(本机未出现)。修法:`definitions/pi.ts` 删失效标题规则、新增 `screen.working` = 10 个点阵帧(码点逐个核对,不用 "Working" 文字以免对话正文造成永久误报)、`title.working`/`screen.waiting` 显式空数组(`AgentStateRules` 两槽必填,空数组=不提供);`pi.fixture.ts` 输入形态改为屏幕帧 + 时间线重标;用例 3 改为屏幕信号,用例 10 的去抖改挂 claude 标题(去抖与 agent 无关,pi 标题已不承载干活信号)。mutation check:撤 `screen.working` → 用例 3、11 转红 → 还原 13 passed
  - 冒烟实测(用户确认,pi 唯一可测):干活 → 绿;`/quit` 或连按 Ctrl+C 回 cmd 提示符 → 灰(ADR-0004:agent CLI 退出≠exited);cmd 下 `exit` 结束 shell → 红;重开同一会话 → 灰(播种纠正);关标签页 → 点消失;重启应用 → 无残留点
  - **未验证/本机不可达**:claude/codex/agy/kimi 均未安装,契约步骤 7「其余 4 家按采样结论核对」无操作对象——这四家的规则仍是 Orca 锚点推算的构造样本,真实采样欠账;`AGENT_SESSIONS_SAMPLE` 真实采样本次未跑(记 backlog,真实 `.bin` 只对 pi 有意义且关键切换已由真机冒烟确认)
  - 口径登记:①契约步骤 6「35 passed」过期,实况基线 82/11,本轮期望改为 93/12,冒烟修复后 95/12;②spec 覆盖标准接缝 stateTracker 第 3 行「pi 标题×π⠋/π-」被实证推翻,**已就地改为「pi 屏幕×点阵帧」**(spec.md 同步修改),属回退协议允许的 spec 修订,不重过门;③`state:title`/`state:snapshot` 两条上行通道与 `ipc/state.ts` 编排层为契约外增补(机械必要,按 T3 先例登记)
  - 下游结论(T6+ 用):①字节证据的生命周期 = 「两次快照之间」,快照是证据代际边界;给五家填 `bytes` 规则时只需保证画面静止时快照仍在跑,waiting 误报就下一帧自愈,不需要 TTL;②事实型状态(exited)与判定型状态(working/waiting)走不同落地路径(`publish()` 直落 vs `requestState()` 去抖),后续加 `'starting'` 之类事实态同理;③编排层新建 tracker 必须显式表态是否播种,新增事件源先问「会不会替退出后的会话复活 tracker」,守卫模板 = `activeSessionIds()`;④`AgentStateRules` 的 `title.working`/`screen.waiting` 等槽位必填,「不提供」要写成空数组而不是省略
  - 文档变更登记:spec.md 一行(覆盖标准 stateTracker 第 3 行)按实证修订;brief/tasks 未动;CONTEXT.md/ADR/AGENTS.md 无改动;plan.md 勾选 T5 + 本章
  - **提交状态**:已提交 3919cbdc(代码与冒烟修复合并,24 文件:13 改 + 11 增,用户已确认);review diff `.review/T5.patch`、`.review/T5-fix.patch` 提交后删除
- 2026-11-21 17:48 | 需求变更(重过门 1):取消忽略清单,删除后的导入会话再次导入直接重新入库
  - 触发:T6 冒烟时用户提出「删掉这两条导入的会话 → 再导一次应能再次导入」。这与 brief 第 5 节「忽略清单防导入扫回」及验收 7.1「再次导入不再出现」正面冲突,按回退协议停下、给三种方案(A 保留拦截+显式恢复 / B 导入时列出已删项 / C 彻底取消)并说明代价,用户选「再次导入时直接导入」= C,并确认重过门 1。
  - 文档修订:brief 第 5 节与 7.1 两行改写;spec 四处(整体实现末句、IgnoreEntry/AppStore.ignoreList、模块划分两行、覆盖标准接缝 path-match/runImport 第 5 行、接口面清单 runImport 行);CONTEXT.md 删除「忽略清单」词条;PLAN.md M4 段改写 + 修订历史追加一行;新增 `docs/adr/0005-删除不登记忽略清单.md`,并在 ADR-0003 头部标注「忽略清单机制条已被 0005 取代,核心决策不变」(ADR 不可改,只标注被取代关系)
  - 代码变更:`AppStore` 去掉 `ignoreList`/`IgnoreEntry`;`DEFAULT_STORE` 与 `loadStore` 不再读写该字段(旧 store.json 残留字段在下次整文件写入时自然丢弃,无需迁移);`session-import/index.ts` 去掉忽略清单过滤;`ipc/sessions.ts` 删除 `registerIgnoreEntry` 与调用;相关注释(ipc-contract/sessions-slice)同步
  - 用例变更:T6 用例 5 语义反转——原「忽略清单命中 → 跳过」改为「删除该会话后再导入 → 重新入库(imported 1 / skipped 0)」;`store-persistence.test.ts` 与 `session-records.test.ts` 的 store 字面量去掉 ignoreList
  - 验证:typecheck 双投影 0 error;`pnpm test` 118 passed / 19 files;eslint 0 error(仅仓内既有 CRLF warning)
  - 遗留语义(记录在 ADR-0005 后果节):「删了又被扫回来」重新成为可能,用户如需永久隐藏目前没有手段;若将来有这个诉求,方案应是「导入时列出已删项由用户勾选」而不是恢复自动拦截
- 2026-11-21 17:54 | T6 开发与评审闭环(冒烟经用户确认 + 需求变更重过门 1,代码待确认提交)
  - BASE=7756ea49;本任务与「取消忽略清单」需求变更合并进同一个 feat 提交(变更发生在任务提交前,属该任务闭环)
  - implementer(worker subagent)按契约完成:`session-import/path-match.ts`(分隔符归一、去尾分隔符、**按路径语法**判 Windows 再折叠大小写,不做前缀/子目录匹配);`session-import/index.ts`(dedupeKey = agentId + NUL + externalSessionId;runImport 取扫描器 → 候选 → cwd 匹配 → 去重 → 入库,记 origin=imported/externalTitle/externalFilePath/activityAt);`session-import/claude.ts`(编码桶定位 + jsonl 解析:custom-title > ai-title > 首条真实用户提示 > agent-name,跳过半截行/索引/子目录);`session-import/codex.ts`(递归 rollout、session_meta 定 id/cwd/标题、首条 UserMessage 兜底、.zst 用 `zlib.zstdDecompressSync`、双形态按 Orca plainWins、同 thread id 多份去重);移植件 `claude-project-dir-encoding.ts`(复制+裁剪,保留三个函数)、`runtime-path-separators.ts`、`codex-rollout-files.ts`(thread id 正则 + twin + plainWins),文件头 `Ported from stablyai/orca … (v1.4.265, MIT)`;接线 `sessions:import` handler(projectPath 由主进程取)、`agents:list` 出站剥离 sessions 函数、渲染层 ImportMenu + `session-order.ts`(activityAt ?? createdAt 倒序 + 折叠 8)+ ProjectGroup 折叠 + `sessions-slice.importSessions`
  - controller 亲跑验证:typecheck 双投影 0 error;`pnpm test` 119 passed / 19 files;eslint 0 error(仅仓内既有 CRLF warning);移植件与 Orca 原件逐行 diff 核对(保留的三个导出函数逻辑一致,裁剪的四个 scope helper 在文件头写明)
  - 首轮评审(reviewer subagent,对照 .review/T6.patch 1892 行):规格符合 ✅、无 Critical、代码质量通过;Important 1 = **领域横向依赖**(`session-import/index.ts` → `agent-registry`,`definitions/{claude,codex}.ts` → `session-import/*` 形成双向边),评审指出这条边由契约逼出、建议记账而非改代码;Minor 5(硬链接 inode 秩未搬、定义↔注册表接线无覆盖、fixture 路径读 cwd、ImportMenu 把「不支持导入」与「没有历史会话」压成一句、移植件头注释自相矛盾)
  - controller 裁定 Important-1:用户拍板「AGENTS.md 记一条显式例外」——工程边界新增「领域横向依赖的唯一例外」条目,理由=「新 agent = 只加一个定义文件」的扩展点要求;不改契约、不重写代码
  - Minor 修复(原 implementer,3 条):①新增 `scan-wiring.test.ts`(不 mock 注册表,断言 claude/codex 都挂了 scan;mutation check:删 `scan: scanClaude` → 转红 → 还原绿)②fixture 路径改 `import.meta.dirname`,去掉对 `process.cwd()` 的隐式依赖 ③移植件头注释改「复制+裁剪」并点名保留/裁剪的符号。余下 Minor 2 条挂账(硬链接 inode 秩 → T7 多根时补;ImportMenu 提示合一 → T7 加能力位时区分)
  - 需求变更(用户冒烟期提出,重过门 1):取消忽略清单,删除后再导入直接重新入库——详见本章上一条独立登记(2026-11-21 17:48 块)与 ADR-0005;控制器亲手实现,另有独立复审(见下)
  - 变更复审(reviewer magpie/zhipu/glm-5.3-flash:low,对照 .review/T6-change.patch 226 行):七个变更点全部 ADDRESSED,无新增 Critical/Important,裁决可提交;建议两条已收:①补 5b「走真实 `sessionRecords.remove` 后再导入 → 仍重新入库」的组合用例(堵住「只在删除路径偷偷登记忽略项」)②两处「brief 第 5 节」注释改为准确指向(brief 7.1 / ADR-0005;另两处 activityAt 注释改指 T6 契约)
  - **样本来源(口径登记)**:本机未安装 claude/codex,契约步骤 1「从本机取样本」不可执行。codex 两份 fixture 移植自 Orca 真实 rollout(`codex-rollout-a/c-0.162.1.jsonl`,用户名脱敏 + 首行 provenance);claude 无原始 transcript fixture,按 Orca 解码器实际读取的行形状构造(含三级标题优先级);三份 fixture 均写明来源,**未伪造「本机真实采样」**。未移植 r24 样本(无 UserMessage,覆盖不到标题路径)
  - **冒烟实测(用户确认)**:用 `AGENT_SESSIONS_AGENT_HOME` 指向 `.tmp/t6-home` 临时存储(本机无真实 agent 存储;该 env 覆盖是本次新增的开发/冒烟通道,带 3 条优先级守卫):导入 claude 1 条 → 再导 0 条(去重)→ 删除 → 再导 **1 条**(新语义)→ codex 同;`store.json` 实况 keys = version/projects/sessions/settings(**无 ignoreList**);`.tmp/t6-home` 两份 fixture mtime 未变(17:33:57 生成,冒烟在 17:45 之后)= 导入全程只读,未写 agent 存储
  - TDD 口径登记:契约步骤 3/5 的「10 failed / 5 failed」实际形态是 module-not-found(先写测试、不留占位实现);步骤 4/6 的「10/15 passed」实际 11/16(多出 dedupeKey 独立用例);步骤 8「50 passed」过期,实况 119/19
  - 测试基数:mutation check 共 8 条留痕(path-match 去 toLowerCase、编码件删 200 字符 hash 分支、codex 翻转 plainWins、index 去 ignoredKeys 判定、claude 桶名去 toLowerCase、scan-wiring 删 scan、agent-home 去 env 分支、5b 组合用例)
  - 下游结论(T7+ 用):①T7 接 pi/kimi/antigravity 只需新增 `session-import/{pi,kimi,antigravity}.ts` 并在各自定义挂 scan,runImport/IPC/UI 零改动 ②标题口径 `collapseWhitespace + 96 字符截断` 两家各自一份,规则同 Orca normalizeTitleText ③`scan` 的 `ctx.homeDir` 与 `AGENT_SESSIONS_AGENT_HOME` 是唯一注入点;codex `.zst` 可用 Node 24 `zstdCompressSync` 现造样本,无需入库二进制 ④扫描结果按 activityAt 倒序返回,runImport 不依赖顺序 ⑤编排层新建 tracker/登记类逻辑必须显式表态「这条路径会不会在删除后留下拦截」——本次整改的教训
  - **未验证/本机不可达**:契约步骤 9「对装 claude 的项目导入」用的是临时构造存储,不是真实 claude/codex 安装;真实 CLI 的存储格式兼容性(尤其 claude 新版 jsonl 字段变化、codex 新版本 rollout 结构)只由移植自 Orca 的 fixture 代表,待用户机器上装 claude/codex 后复核
  - 文档变更登记:brief 两行(第 5 节 + 7.1)、spec 五处、CONTEXT.md 删「忽略清单」词条、PLAN.md M4 段 + 修订历史一行、新增 `docs/adr/0005-删除不登记忽略清单.md`、ADR-0003 头部标注被 0005 取代、AGENTS.md 新增「领域横向依赖的唯一例外」、plan.md 勾选 T6 + 两条记账
  - **提交状态**:已提交 7b8a8aa5(代码 30 文件:18 改 + 12 增,用户确认)+ 本条 docs 提交(8 文件);T7 BASE=本条 docs;review diff `.review/T6*.patch` 提交后删除
- 2026-11-21 18:54 | T7 开发与评审闭环(冒烟经用户确认,代码待确认提交)
  - BASE=b0962078
  - implementer(worker subagent):`session-import/pi.ts`(编码桶直达 `<home>/.pi/agent/sessions/<桶>/`,**只扫桶顶层**——桶内 `<ts>_<uuid>/<agent>/run-0/session.jsonl` 是子代理跑批;首行 `type:'session'` 取 id/cwd;标题取首条 `role=user`(跳过 68KB 的 harness `role=system`);activityAt=最大 timestamp;filePath=绝对路径供 T8 续接);`kimi.ts`(`state.json` × `session_index.jsonl` 双源,id 保留 `session_` 前缀,title→lastPrompt 兜底,ISO 串与 epoch 毫秒两种时间戳,缺源不产出);`antigravity.ts`(brain transcript + cwd 三级关联:history `conversationId` → 开场 prompt sha256 + ±2s 唯一命中 → cache `WorkspaceURIs` 唯一 file: URI);三个定义挂 `sessions.scan`;`scan-wiring.test.ts` 接线守卫扩到五家
  - controller 亲跑验证:typecheck 双投影 0 error;`pnpm test` 130 passed / 22 files(基线 119/19,+11:契约 8 条 + 我后来补的 3 条);eslint 新改文件 0 error
  - **本机路径实测(本次最大收获,pi 真数据)**:`~/.pi/agent/sessions/` 下 9 个桶、顶层 34 个 `.jsonl`(递归 164,多出的全是子代理转录);桶名规则 `'--' + cwd 中 ':' 与 '\' 逐个换 '-' + '--'` 经 9 桶 × 34 文件穷举核对 **9/9 一致**;`scanPi` 真机实测 `D:\workspace\multi-agent-session` → 5 条/88ms、`pi-test` → 12 条/49ms、不存在项目 → 0 条/0.3ms;端到端 `runImport(pi)` 首导 5 条、再导 `{imported:0,skipped:5}`;5 条 `externalFilePath` 全部存在
  - 首轮评审(reviewer subagent,对照 .review/T7.patch 1384 行):规格符合 ✅、无 Critical;Important 1 = `transcript_full.jsonl` 被无条件优先,忽略 mtime(Orca 是 mtime 降序 + 同刻才用 full tiebreak;后果=activityAt/标题取自旧快照、filePath 指向旧文件给 T8 添乱),且原注释「Orca 的排序同样偏爱 full」是错误断言;Minor 8(history 同 id 冲突时 `??` 链把 null 当缺席、ACP cwd 源未搬且裁剪清单没列、无索引体积上限、piBucketName 只覆盖反斜杠、用例 4 没钉住 ±2s 与唯一性、若干无覆盖分支、冗余断言、头注释字面不统一)
  - Important 修复(controller 亲手 + 独立复审):`findTranscriptPath` 改「各自 stat,mtimeMs 较大者胜,mtime 相同才 full tiebreak」并改掉错误注释、文件头补 `antigravity-transcript-candidates.ts`;cwd 关联链改 `has(id) ? get(id) ?? null : fallback`(冲突即拒绝,对齐 Orca)并删掉随之变死的辅助函数;头注释补 ACP cwd 源未搬;新增 4c(mtime 择新)/4d(超 ±2s 不关联)/4e(窗口内两次 → 非唯一命中不关联)三条用例;用例 4 补 `utimes` 把两份 transcript 设同刻,专门钉 tiebreak 分支
  - 复审(reviewer magpie/zhipu/glm-5.3-flash:low,对照 .review/T7-fix.patch 191 行):4 条全部 ADDRESSED,无新增 Critical/Important,裁决可提交;新增 Minor(用例 4 注释过时 + 依赖写入顺序)已在本轮钉死(utimes 同刻 + 注释改写)
  - mutation check 留痕 7 条:pi 去 `role==='user'` 过滤 → 标题变 harness 提示;pi 递归扫子目录 → 多出子代理候选;kimi 去 `session_` 前缀 → id 变裸 uuid;antigravity 用最后一条提示关联 → cwd 变诱饵 beta-app;**full 无条件优先 → 4c 红;去 ±2s 窗口 → 4d 红;唯一性放宽为 >=1 → 4e 红;tiebreak 反转 → 用例 4 红**。另如实记录:首次尝试的「调换遍历顺序」变异**未转红**(mtime 不同时顺序不影响结果),改用真正改变语义的变异
  - 冒烟实测(用户确认):导入 Pi 首次 **5 条**、再导 **0 条**;点导入会话 → pi 启动但为**新会话**(符合 T7 语义:导入只列元数据,续接是 T8;PLAN M4 明文「点击行为与新建一致,不构造 resume 命令」)
  - **未验证/本机不可达**:kimi / antigravity 未安装(`~/.kimi-code`、`~/.gemini` 均不存在),其布局与记录形状取自 Orca 源码与测试样本工厂,**未经本机实测**;claude/codex 同样未装(T6 已记)。真机装后需复核的点:kimi 是否 `<home>/.kimi-code/sessions/<工作区>/session_*/state.json` 且索引在同级;antigravity `transcript_full` 是否总比 `transcript` 新
  - 口径登记:①契约步骤 4/5/6 的「5 failed / 5 passed / 55 passed」系门 2 与旧基线时点,实况 3 failed(module-not-found)/ 8 it / 130 passed ②坏样本第 5 条按 agent 拆成三条 it(诊断性拆分)③`scanKimi`/`scanAntigravity` 关联不出 cwd 的会话直接跳过(`ImportCandidate.cwd` 必填,与 Orca 允许 null 有差异,已写 Why)④`piBucketName` 只对 Windows 反斜杠路径成立(项目路径经 `ipc/projects.ts` 的 `path.normalize` 保证),非 Windows 会静默返回空——留 Minor
  - 下游结论(T8+ 用):①T8 的续接原料已就位:pi = `externalFilePath`(实测 5/5 存在)、kimi = `externalSessionId`(含 `session_` 前缀,`kimi --session <id>`)、antigravity = `externalSessionId`(brain 目录名即会话 id)②pi 的会话子目录与 `subagent-artifacts/` 永远不能当会话,任何后续改动必须守住「只扫桶顶层」,已有嵌套诱饵用例守着 ③`AGENT_SESSIONS_AGENT_HOME` 可复用来做三家的端到端冒烟(造 `<tmp>/.pi`、`<tmp>/.kimi-code`、`<tmp>/.gemini`)④kimi 索引的配对键是带 `session_` 前缀的目录名;若真机实测索引行不带前缀,改点在 `parseKimiSession` 的查找键(一行)
  - 文档变更登记:四层文档无实质变更(brief/spec/tasks 未动;spec 的 scanPi/scanKimi/scanAntigravity 覆盖行与实现一致);CONTEXT/ADR/AGENTS 无改动;plan.md 勾选 T7 + 本章
  - **提交状态**:已提交 2771e0a9(代码 17 文件:4 改 + 13 增,用户确认)+ 本条 docs 提交;T8 BASE=本条 docs;review diff `.review/T7*.patch` 提交后删除
- 2026-11-21 20:15 | 需求变更(T8 冒烟期提出,经用户确认):导入会话重开由「原样拉起」改为「续接该历史对话」
  - 触发:用户冒烟期提出——导入的历史会话(典型来源:PowerShell 等应用外创建的对话)点击打开时应继续该对话、可见此前内容,而非全新对话
  - 决策:①渲染层 reopenSession 去掉 `origin !== 'imported'` 过滤,有 externalSessionId 即带 resume ref(一行条件;五家 resume 原料导入时已入库——externalSessionId 必有,pi 另有 externalFilePath 实测 5/5,与自建回填共用同一套注入链路)②老会话转录文件已被清理时不加前置存在性检查:pi 报错退回 shell 提示符,如实可见,不为低概率场景加复杂处理(冒烟后体验不佳再补)③不立新 ADR:决策可逆,一行条件可改回
  - 文档修订(brief 冻结条目,按回退协议):brief 7.1「点击拉起行为与新建一致」改写为「点击导入会话续接该历史对话」;spec 的 Session.externalSessionId 注释(「imported:去重键」→ 同时是重开续接定位)同步;实施时一并修订
  - 实施时点:T8 按冻结契约完成冒烟并提交后实施(用户指令「先记录,先跑完冒烟」)——T8 冒烟项「imported 原样拉起」仍按现契约验收;变更落地后另行冒烟「imported 续接」。本机可测仅 pi,其余四家逻辑同源,装后复核
- 2026-11-21 20:40 | T8 开发与评审闭环(冒烟经用户确认,代码已提交)
  - BASE=a9a93b4b;implementer(worker subagent)按契约完成:接缝 `src/main/session-store/backfill.ts`(claim 纯判定 + 内表双核 / poll 节流轮询 / release / releaseAll / pollingSessions;档位 [750,2000,3000]→15000 封顶移植 Orca agent-completion-poll-cadence,放弃时限 300_000ms 从 claim 起算;release 即时中止在途轮询——scan await 前后双重核对持有状态,防已死会话误捞接棒会话文件串线,系超出裁决字面的补强);五家 resumeArgv(返回参数部分,见口径③);重开链路(`ResumeRef` → pty:spawn 载荷可选 resume → ipc/pty 经 resumeArgv 构造 → ptyRegistry 载荷可选 launchArgs 注入行);回填接线(spawn 成功后 created 且无 id → scan 闭包(按该 agentId 已有 id 集合过滤只留新会话)→ claim → poll → 写回 id+filePath+scheduleSave;释放三路径 ptyKill/sessionsRemove/before-quit releaseAll 先于 flush;registerPtyIpc 扩签名收 store+scheduleSave,入口组合注入不跨域 import);双开拦截核对:前端 tabs 聚焦 + spawn sessionId 冲突拒绝两道防线完好未触碰
  - controller 亲跑验证:typecheck 双投影 0 error;vitest 141 passed/23 files(130 基线 + 10 接缝 + 1 接线守卫);修复后 151 passed/23;复审后聚焦复跑 34 passed(3 文件)
  - 首轮评审(reviewer subagent,对照 .review/T8.patch 823 行,独立核对 Orca 原文与 poll-cadence 档位):规格符合 ✅,无 Critical;Important 2——①回填候选无新鲜度护栏:首扫早于 agent 建文件,从未导入的老文件不在 known 集合 → 老对话 id 误写 → 重开续接错对话(本接缝核心失败形态「续接到别的对话」的现实触发路径)②launchArgs 裸拼:含空格转录路径被 cmd 拆段,pi resume 静默失灵;Minor 2(PTY 退出不释放资格、资格挂满 5 分钟自然放弃——裁决内行为记录;claim 同会话重入重置 claimedAt——正常链路不可达)
  - Important 修复(原 implementer):Fix-1 `filterFreshCandidates`(候选 filePath mtime > claim 时刻才保留;stat 失败本 tick 丢弃不结束轮询;保留者 mtime 升序——最早文件属先 spawn 会话,与单待回填先开者身份吻合,candidates[0] 不再盲猜;为何 mtime 而非 activityAt:五家 scan 全产 filePath,跨家语义一致不依赖格式统一;残余边界=终端并行的活跃老会话仍会入选,brief 简单规则固有边界,注释如实登记)+ ipc/pty 接线 statSync 注入;Fix-2 `quoteLaunchArg`/`buildAgentLaunchLine`(含空白参数双引号包裹,边界与 buildShellLaunchLine 同——路径不含 " 不涉转义矩阵),buildShellLaunchLine 原函数与测试不动;守卫 +5(backfill 纯函数)+4(注入行)+1(接线守卫:静态断言 ipc/pty 调用 filterFreshCandidates——变异目标是调用点,纯函数直测不敏感,electron 依赖不可单测的盲区由 wiring 定位补上);mutation check ×2 留痕(编排层绕开过滤 → 接线守卫红因精确指向串线缺陷;quoteLaunchArg 改原样返回 → 2 红含 expected '"C:\\a b\\session.jsonl"')
  - 复审(reviewer magpie/zhipu/glm-5.3-flash:low,对照 .review/T8-fix.patch 1034 行):两发现全 ADDRESSED,无新增 Critical/Important,裁决可提交;范围外观察 2(接线守卫为文本包含检查,mtimeOf 逐候选同步 statSync——当前规模无影响)
  - 口径登记:①契约步骤 2「10 failed」实况 = module-not-found 整套件 0 test(T6/T7 同先例,未留桩伪造)②步骤 5「65 passed」系门 2 时点,实况基线 130/22,本轮后 141/23,修复后 151/23③resumeArgv 返回参数部分不含命令名(controller 裁决记账):命令本体由 spawn 链路 resolveCommandPath 解析,重复返回会注入两次;spec 覆盖标准「argv 与 Orca 原文逐参数一致」解读为参数部分逐参数一致,用例 6-10 按「Orca 数组去首元素」对照④节流档位 [750,2000,3000,15000] 与放弃时限 300_000ms 系 controller 拍板(契约只定「照抄 Orca 节流」「到头放弃」语义)⑤「spawn 后 claim 一次」接线语义:claim 失败的会话在持有者释放后**不自动接棒**,重开(新 spawn)时才再 claim——契约步骤 4 字面实现;「自动接棒」为契约未明文的增强,未实施⑥新鲜度护栏的行为代价:claim 晚于会话文件创建的会话不回填(典型=并发后开者重开走全新对话),防串线优先于自动续接,预期边界
  - TDD waiver(留痕):ipc/pty.ts 回填编排层(import electron)无单测——T5 先例(编排层薄、行为靠冒烟);关键纯逻辑已抽 filterFreshCandidates 进接缝全测,调用点由接线守卫钉住
  - 冒烟实测(用户确认,pi 唯一可测):①续接主链路 ✓(自建会话聊一句→关标签页→重开,pi 恢复上下文)②双开拦截 ✓(重开运行中会话聚焦现有 tab 不开新终端)③imported 原样拉起 ✓(按现契约验收;「imported 续接」变更已登记见 20:15 条,T8 提交后实施并另行冒烟)④并发资格 ✓(1~2s 内连开两会话,仅先开者续接,后开者重开全新对话);claude/codex/agy/kimi 本机不可达,装后复核
  - 下游结论(T9-T11 与收尾用):①重开续接唯一入口 = 渲染层 pendingSpawns.resume → pty:spawn resume → ipc/pty resumeArgv;新增 agent 续接只需定义挂 resumeArgv,框架零改动②若要「自动接棒」,在 ipc/pty.ts 的 ptyRegistry.onExit 或 release 处补「待补会话重 claim」,接缝无需动③pty-registry 注入行纯函数三件(buildShellLaunchLine/quoteLaunchArg/buildAgentLaunchLine)有测试钉住,改注入形态先改测试④spec 接口面清单已补 4 行(计划外导出回填,reviewer ⚠️ 项)
  - 文档变更登记:spec.md 接口面清单 4 行;brief/tasks/CONTEXT/ADR 未动(CONTEXT.md 的回填/续接词条随「导入续接」变更实施一并沉淀);「导入续接」变更登记见本日 20:15 条
  - **提交状态**:已提交 5fa46afb(代码 16 文件:14 改 + 2 增,用户确认)+ 本条 docs 提交;review diff `.review/T8*.patch` 提交后删除
- 2026-11-21 21:31 | 「导入续接」变更实施闭环 + 孤儿记录缺陷修复(冒烟经用户确认,均已提交)
  - 变更实施(controller 亲手,20:15 条决策落地):sessions-slice.ts 续接条件去 `origin !== 'imported'`(有 externalSessionId 即带 ref;无 id 仍原样拉起);brief 7.1 改写(保留原文可溯)、spec 的 Session.externalSessionId 注释、CONTEXT.md「agent 对话」词条补续接适用规则、ipc-contract 的 sessions:open 过时注释同步;无接缝/契约形状变化(pty:spawn 的 resume 载荷 T8 已就位)
  - 变更复审(reviewer magpie/zhipu/glm-5.3-flash:low,对照 .review/T8-change.patch 82 行):五处全 ADDRESSED、无新增 Critical/Important,裁决可提交;一行级建议 2(三元续行缩进、ipc/pty.ts:101 过时注释)已顺手处理
  - **缺陷发现与诊断(T8 冒烟期用户报「/resume 6 条 vs 导入只有 2 条」)**:取证(scanPi 真机探针 + store.json 剖析)实锤——scanPi 产出 6 条与 /resume 一致,**扫描器无缺陷**;根因 = 用户删过项目重新添加,projectId 变化(4efbd96e→8199a078),T7 导入的 4 条本项目记录成孤儿(挂旧 id 永不可见)却仍占导入去重键 → 再导入被「跳过 6 条」拦截;即 **T4 已知空白①的现实发作**,本条闭环
  - 缺陷修复(controller 亲手,TDD):①根治——`sessionRecords.removeByProject` 新接缝方法(返回被移除 id 供连带关标签页)+ `projects:remove` 连带删除该项目下会话记录(契约返回 `{closedTabs}`,渲染层撤 tab 杀 shell,与删除会话同款;agent 存储不动)②自愈——`existingSessionKeys` 排除孤儿记录(projectId 无对应项目不参与去重),存量孤儿重新导入即恢复可见;新增守卫 2 条(removeByProject 接缝用例 + 用例 6「孤儿不拦截导入」),mutation check ×2 留痕(去孤儿排除 → 用例 6 红;removeByProject 改「返回不清除」→ 接缝用例红,均还原全绿)
  - 冒烟实测(用户确认):①孤儿自愈 ✓(再导提示导入 4 条,侧栏恢复 6 条)②删除语义 ✓(删项目重加同目录不再见旧会话记录);「导入 N 条」提示语义 = 本次新增数(去重命中计入 skipped),本次维持现状不改文案
  - 口径登记:①基线 151/23 → 修复后 153 passed/23 files(+2 守卫)②TDD waiver(留痕):ipc/projects.ts 删除编排(import electron)无单测——编排薄层先例,行为靠冒烟;接缝逻辑(removeByProject/existingSessionKeys)全覆盖③存量 pi-test 孤儿 18 条留 store 无害(不拦截导入),重新添加 pi-test 项目再导入即恢复
  - 下游结论(T9-T11/收尾用):①导入提示「导入 N 条」= 新增数,若要做「N 条新增、M 条已存在」细分文案,改点在 ImportMenu 的结果展示(数据 imported/skipped 已具备)②删项目的连带范围现已完整:记录删除(主进程)+ 标签页关闭(渲染层 closeTab 杀 shell)——将来若加「删除项目前确认框」,列明会话数即可
  - 文档变更登记:brief 7.1(变更改写)、spec Session 注释、CONTEXT.md「agent 对话」词条——均随本条提交入库;tasks/T8.md 未动(契约是历史执行件)
  - **提交状态**:已提交 d4bd0430(feat: 导入续接变更,5 文件)+ 757e6ec5(fix: 孤儿记录,7 文件,用户确认)+ 本条 docs 提交;review diff `.review/T8-change.patch` 提交后删除
- 2026-11-21 22:40 | T9 开发与评审闭环(冒烟经用户确认,代码已提交)
  - BASE=665e28c3;implementer(worker subagent)按契约完成:`src/main/fs-tree.ts`(接缝 shouldIgnore/scanTree(root, depth=1);IGNORED_NAMES 五项 ['.git','node_modules','dist','out','.reference'] 精确匹配;单层扫描懒展开——子目录 children 恒 undefined,前端点开再请求;symlink 一律跳过防越界/环;root 不可读兜底空树;目录在前 localeCompare)、`src/main/file-content.ts`(readFilePreview 单句柄 open+stat+同句柄按绝对位置补齐读,clamp [1,2_000_000],前 8192 字节 NUL 嗅探 binary,错误经 {error} 载荷不抛)、`src/main/ipc/open-in-editor.ts`(code 优先/系统默认回退编排)、`src/main/ipc/files.ts` 三通道、契约/preload/入口装配、渲染层 file-panel 三件(FileTreePanel/FileTree/FilePreview)+ 右栏接入
  - controller 亲跑验证:typecheck 双投影 0 error;vitest 164 passed/25 files(153 基线 + fs-tree 5 + file-content 6,自洽);git status 与清单逐项一致
  - 首轮评审(reviewer subagent,对照 .review/T9.patch 871 行,聚焦核实 resolver 源码与既有调用点):规格符合 ❌ 仅 1 项;**Critical-1——open-in-editor 的「优先 VS Code」在 win32 机制性失效**:resolveCommandPath('code') 按 PATHEXT 命中 bin\code.cmd(标准安装只有 bash 脚本 code 与 code.cmd),Node ≥20.12.2 / Electron ≥31(CVE-2024-27980 修复)起 execFile 无 shell 执行 .cmd 恒 EINVAL → 恒静默降级系统默认打开,via:'vscode' 永不可达;「T3 实测同款」类比不成立(T3 的执行点是 node-pty 经 shell,非 child_process.execFile);Minor 3(execFileQuiet 无超时、contract 头注释 T5 行重复、files:read 无路径沙箱——桌面单用户应用记为已知边界)
  - Critical-1 修复(controller 亲手,运行时探针链先坐实再修):直拉 code.cmd → `spawn EINVAL` 坐实;cmd /d /s /c 包装但不显式开 verbatim → 三种引号形态全败(根因:file 为 cmd.exe 时 Node 走标准 MSVCRT 参数转义,手写引号被二次转义破坏,`\"C:\P` 碎片实证);**修正形态 = cmd /d /s /c + windowsVerbatimArguments: true + `""${resolved}" "${target}""` 整段再包引号**(/s 引号规则:剥第一个引号删最后一个,内部引号保留)——探针:自造含空格 .cmd `ARGS=hello world` ✓、真实 code --version `1.147.0` ✓、含空格双路径端到端 OK ✓;一并落地 Minor-2(execFileQuiet 加 timeout 5000ms,挂死回退)与 Minor-1(重复注释行);复审(reviewer :low)三条全 ADDRESSED 无新增,裁决可提交
  - TDD:fs-tree 五条先红(module-not-found 先例形态)后绿;file-content 6 条守卫为裁决 8 授权自加——**守卫立刻抓到真 bug**(Node fs.promises.FileHandle 只有 stat() 没有 fstat(),4 条红后修正),判断成立;TDD waiver(留痕):ipc/files.ts 与 open-in-editor.ts 编排层 import electron 无单测(编排薄层先例,行为靠冒烟 + Critical-1 修复由运行时探针链证明)
  - **冒烟发现并修复(白屏,controller 违反红线)**:预览移中间区时 controller 在 TerminalTabs.tsx(渲染层)加了 `import { basename } from 'node:path'`——渲染层纯浏览器环境禁一切 Node 模块(AGENTS.md 工程红线),bundle 解析失败 → 应用启动白屏;全仓扫描确认为渲染层唯一一处;修复:文件名在 file-preview-slice 自派生(path 末段 split),TerminalTabs 读 previewName;验证补 `pnpm build`(渲染层 bundle 解析通过)与渲染层 node import 清零检查。教训:渲染层改动后除 typecheck/vitest 外必须过一次 build(它才能抓模块解析错)
  - 需求调整(用户冒烟期提出):预览从右栏移到中间区域——做成中间区标签栏里的**预览标签页**(与终端标签并列,点文件打开、可切换、× 关闭),右栏只剩全高文件树;新增 `file-preview-slice.ts`(previewPath/previewName/previewActive + open/activate/deactivate/close;进 Zustand 的理由 = 预览发起在右栏、渲染在中间区,跨组件——原裁决 7「局部 state」的前提因布局调整失效,如实登记);FileTreePanel 去预览区、选中高亮改读 previewPath;终端尺寸不受预览影响(预览激活 = 终端 tab 隐藏,与切走标签同语义)
  - 冒烟实测(用户确认):①树展开流畅(.reference 不出现)②点文件中间区预览标签页正常、终端/预览标签切换正常③截断/二进制提示正常④「VS Code 打开」文件与「打开目录」均正常(Critical-1 修复验证点)⑤白屏修复后启动正常;「未装 VS Code 回退系统默认应用」本机不可达(VS Code 已装),装后复核
  - 口径登记:①契约步骤 2「5 failed」实况 = module-not-found 整套件(先例形态)②步骤 5「70 passed」系门 2 时点,实况基线 153/23,本轮后 164/25③预览请求字节数渲染层取 200_000(≈195KB,窄面板 2MB 过重;主进程 clamp 2MB 兜底)④懒展开的 children 语义:undefined=未扫、[]=已扫空,有守卫钉住
  - 下游结论(T10/T11 与收尾用):①`file-content.ts` 单句柄补齐读模式可直接复用(有界读取/二进制嗅探);②`open-in-editor.ts` 的 cmd 包装形态(cmd /d /s /c + windowsVerbatimArguments + 双引号整段)是 Windows 上 execFile .cmd 的唯一可行姿势,后续任何「执行 .cmd shim」场景照抄;③渲染层禁 Node 模块——白屏教训,新增渲染层代码后跑 `pnpm build` 验证;④eslint react-hooks/set-state-in-effect 已启用,effect 拉数据用「key 重挂 + 异步回调内 setState」形态;⑤预览单实例(previewPath 单值),将来要「多文件多标签」需把 previewPath 改数组
  - 文档变更登记:四层文档无实质变更(spec 的 files 三通道与 TreeNode 形状与实现一致;TreeNode 在 shared 落地系 T9 消费首件,spec「已定义」表述与实况差异已在本条知悉);CONTEXT/ADR/AGENTS 无改动;plan.md 勾选 T9 + 本条
  - **提交状态**:已提交 e07dbc43(代码 16 文件:6 改 + 10 增,用户确认)+ 本条 docs 提交;review diff `.review/T9*.patch` 提交后删除
- 2026-11-21 23:43 | T10 开发与评审闭环(冒烟经用户确认,代码已提交)
  - BASE=851f384b;**implementer 派发失败降级**:原计划派 implementer subagent,该 subagent 因模型服务商 5 小时额度上限中断(Zhipu GLM,23:38 重置),工作区未产生任何改动(git status 核实干净);按 dev 技能 fallback 路径**由 controller 会话内实现**(TDD 逐条),评审仍派独立 reviewer 上下文
  - 落地:`src/main/git-service.ts`(接缝 parseStatusPorcelain——porcelain v1 状态码矩阵完整档:XY 两列、`##` 分支头三段切分 + unborn 前缀剥离、`R/C` 箭头取新路径、`!!` 跳过、短行/空行容错、引号与两种转义剥离、路径不 trim;gitService.for(root) 按 root 缓存句柄,status 走 raw 喂自家接缝,diff/stage/unstage/commit/branches/checkout 薄封装,unborn HEAD 用 rev-parse 探测后 diff 返空/unstage 走 `rm -f --cached`)、`src/shared/git-diff-lines.ts`(接缝 parseDiffLines 实现:diff 头清单→other、单 +→added、单 -→removed、其余 context、末尾空行剔除;放 shared 因渲染层着色复用同一套规则,git-service 再导出保住契约落点)、`src/main/ipc/git.ts` 七通道(错误 toError 归一后 reject)、契约 GitStatus + 七通道 + GitApi、preload git 域、入口装配;渲染层 git-panel 四件(GitPanel 分支下拉+状态列表+提交框+notRepo 空态、StatusList 已暂存/未暂存两组+单文件暂存/取消暂存+状态中文标签、CommitBox 多行说明+空说明与零暂存禁用+显示当前分支、DiffView 外层读 store+内层 key 重挂取 diff+增绿删红)、file-preview-slice 增 previewKind/previewRoot、TerminalTabs 按 kind 分流
  - TDD:12 条接缝测试先红(module-not-found 整套件,先例形态)后绿;**TDD 期间修正自己写错的一条期望**(用例 2 未跟踪条目原写 staged='?',按「staged 非空 → 已暂存组」的分组语义改为 staged=' ',否则未跟踪文件会错列已暂存且零暂存时提交按钮可点——reviewer 复核确认该判断成立)
  - controller 亲跑验证:typecheck 双投影 0 error;vitest 176 passed/26 files(164 基线 + 12);eslint 改动文件 0 error;prettier 已 --write;build 通过;渲染层 Node import 计数 0;**真实仓库探针**(临时文件已删):本仓库 status → branch=main/18 条 X/Y 正确、branches {current:main,all:[main]}、diff 424 字符、非仓库目录抛 not a git repository、同 root 句柄缓存命中;**写路径探针**(一次性临时仓库):空仓库分支剥成 main、暂存 A 码、unborn HEAD 取消暂存不炸、commit 返回摘要哈希、branches/checkout 通、有 HEAD 后 diff 含 +three——故冒烟不需要在真实仓库造提交
  - 首轮评审(reviewer subagent,对照 .review/T10.patch 1196 行,聚焦核实 channels/bridge/tsconfig/产物 CSS/button 签名):规格符合 ✅,Important 2——①空仓库(unborn HEAD)parseBranchHeader 输出伪分支名 `No commits yet on main` 灌进分支下拉,且 `git diff HEAD`/`git reset HEAD` 抛 fatal 英文原文渲染到界面 ②切项目后已打开的 git-diff 标签用新 root 拉同名相对路径,静默显示错项目的差异;Minor 8(classifyDiffLine 非 hunk 状态机、R 码丢旧路径、容错分支无 fixture、main 侧再导出成死接缝、pre`<div>` 内容模型、CommitBox 无分支、reload 不 await、提交后 diff 不重取)
  - Important 修复(controller):①`UNBORN_PREFIX` 剥离 + `hasHead`(rev-parse --verify 探测)+ diff 无 HEAD 返空 + unstage 无 HEAD 走 `rm --cached`;守卫用例 7b(**mutation check 留痕**:改回不剥前缀 → 7b 精确转红 1 failed/12 passed,还原 13 passed)②切片加 `previewRoot`(openPreview 第三参),GitPanel 传发起时 root,DiffView 取 `previewRoot ?? 当前项目`,`key = ${root}::${path}`;顺手修 Minor:path 不 trim、`<pre>`→`<div>`、CommitBox 显示分支、reload 改 await
  - 复审(reviewer :low,对照 .review/T10-fix.patch 1246 行):6 条全 ADDRESSED,无新增 Critical/Important;新增 Minor-A/B/C/D/E 已就地处理——A(空仓库 unstage 需 `-f`,**controller 按复审委托跑真实命令坐实**:无 -f 报「staged content different from both the file and the HEAD」,加 -f 后文件变回未跟踪)、B(`??` 不对空串回落,改 `||`)、C(hasHead 把真出错归成无 HEAD,可达性低,记录)、D(DiffView 头注释与实现打架)、E(prettier 长行)
  - **需求调整(用户冒烟期两次提出,均当场实现)**:①面板入口从右栏标题移到「标题栏」——先加应用内顶栏,用户指出「不是新建一个栏,而是在标题栏那里」后改为**真窗口标题栏**:`app-window.ts` 用 `titleBarStyle: 'hidden'` + `titleBarOverlay`(颜色随 nativeTheme,高 36),渲染层顶栏即窗口标题栏(`-webkit-app-region: drag`,按钮 no-drag,按 `env(titlebar-area-width)` 让出系统按钮区)②去掉三处重复标题行(左栏「项目」、右栏「Git」、「Git」面板内部头),左栏开关与面板动作(⟳ 刷新、↗ 打开目录)全部收敛到标题栏;面板以 `${projectId}:${refreshTick}` 作 key 重挂实现刷新,不在组件间传回调
  - 冒烟实测(用户确认):标题栏单行、左栏开关可用、文件/Git 切换与动作按钮随面板出现、⟳ 刷新生效、↗ 在 VS Code 打开目录、面板内部无标题行、「改文件出 diff + 着色」正常、暂存/取消暂存分组正确、分支下拉显示 main;提交功能未在真实仓库点(避免污染线性历史),由一次性临时仓库探针覆盖
  - 口径登记:①契约步骤 2「12 failed」实况 = module-not-found 整套件 ②步骤 5「82 passed」系门 2 时点,实况基线 164/25,本轮后 177/26(12 接缝 + 1 守卫 7b)③`git:diff` 用 `git diff HEAD -- <path>`(含已暂存与未暂存),**未跟踪新文件此处为空**(渲染层显示「暂存后可见差异」),已知边界待后续任务 ④parseDiffLines 落 shared 由 git-service 再导出:渲染层着色复用同一规则避免两份实现漂移,契约落点仍可寻址 ⑤`pnpm add` 因本机 PATH 上 pnpm 9.4.0 与项目声明 pnpm@10.17.1 的 virtualStoreDirMaxLength(60 vs 默认 120)不一致而失败,全程改用 `corepack pnpm`(后续会用 pnpm 加依赖的会话注意)
  - TDD waiver(留痕):ipc/git.ts 与 gitService 本体(spec 明定「非接缝,行为靠冒烟」)无单测——真实行为由上述两轮探针 + 用户冒烟覆盖
  - 下游结论(T11 与收尾用):①**窗口已是自定义标题栏**:新增/改动顶部控件必须留在 `-webkit-app-region: drag` 区内且自身标 no-drag,右侧要预留 overlay 宽度(否则被系统按钮压住);T11 接手动主题切换时须调 `win.setTitleBarOverlay` 同步 overlay 颜色 ②面板刷新统一用「refreshTick + key 重挂」,不要在面板内再造标题行 ③`git diff` 对未跟踪文件返空是已知边界,若要补:改用 `git diff --no-index -- /dev/null <path>` 或渲染整文件为全增 ④`classifyDiffLine` 不是 hunk 状态机:正文行首恰为 `---`/`+++`(如 YAML/SQL 注释)会丢着色,文本不受影响 ⑤simple-git 4.x:`git.raw()` 拿原文最稳,结构化 status/branchLocal 的字段语义随版本漂(T11 若升级 simple-git 需先跑 git-service 探针)
  - 文档变更登记:四层文档无实质变更(spec 的 git 七通道与 GitStatus 形状与实现一致;GitStatus 在契约落地系 T10 消费首件,spec「已定义」表述差异已在本条知悉);CONTEXT/ADR/AGENTS 无改动;plan.md 勾选 T10 + 本条
  - **提交状态**:已提交 dbbbd241(代码 18 文件:10 改 + 8 增,含 simple-git 依赖与标题栏整合,用户确认)+ 本条 docs 提交;review diff `.review/T10*.patch` 提交后删除
- 2026-11-22 00:31 | T11 开发与评审闭环(代码完成;**手动冒烟待用户验证,未勾选**)
  - BASE=3d3f6e8a;controller 亲手实现(本任务未派 implementer:通知/主题/快捷键/打包皆为跨层小改动,且上一任务派发曾因额度中断;评审仍派独立 reviewer 两轮)
  - 落地:`src/main/notify.ts` 接缝 shouldNotify(waiting && !focused)+ 4 条用例;`src/main/active-session.ts`(主进程前台会话持有者,写入 sessions IPC / 读取 state IPC,避免领域横向 import);`ipc/state.ts` 加 `maybeNotify`(focused = 窗口存活 && isFocused && 前台会话匹配;Notification.isSupported 守卫;点击 restore+focus+发 notify:open;仅真实变化触发,seed 播种不发);契约 +`sessions:set-active`/`notify:open` + `SessionsApi.setActive` + `StateApi.onNotifyOpen` + `NotifyOpenEvent`;渲染层上报前台会话(focus/blur 重报)并订阅点通知聚焦
  - 主题:main.css `@custom-variant dark (&:where(.dark, .dark *))`(Tailwind 4 class 策略)+ `src/renderer/src/theme.ts`(resolveDark/applyDarkClass/systemPrefersDark,同设 color-scheme)+ ThemeToggle 三态循环(系统→浅→深,挂载读设置、system 时随 matchMedia 跟随、点击持久化)+ `settings:set`(值校验 + nativeTheme.themeSource + setTitleBarOverlay 同步 + 原子落盘);main.tsx 渲染前先按系统偏好落一次类(防首帧白闪)
  - 快捷键(渲染层 keydown,`globalShortcut` 是系统级会抢键故不用):Ctrl+N 新建会话菜单(菜单展开态提到新 `ui-slice`)、Ctrl+B 左栏、Ctrl+Shift+E/G 文件/Git 面板、Ctrl+Tab/Shift+Tab 切标签、Ctrl+W 关标签;**输入态守卫**——终端内(`closest('.xterm')`)只放行 Ctrl+Tab,其余组合交给 shell(readline 的 B/E/N/W 都是编辑键),输入控件内一律放行,`event.repeat` 早退
  - **改名 Soloport + 数据迁移**:package.json name=soloport/author、appId com.soloport.app、productName、可执行名、安装包名、窗口标题、顶栏文案、TERM_PROGRAM 全部同步;新增 `src/main/store-migration.ts`(`migrateLegacyStore(newDir, legacyDir)` 纯参数、不 import electron)从 `%APPDATA%/agent-sessions` 复制 store.json 到 `%APPDATA%/Soloport`(新有则不动手、复制不搬移、失败不阻塞启动且只在 copy-failed 记日志)+ 3 条单测
  - 打包:`electron-builder.yml`(NSIS、可选安装目录、桌面/开始菜单快捷方式、deleteAppDataOnUninstall:false、artifactName `${productName}-${version}-setup.${ext}`、files 排除 .reference/.tmp/.review/docs/scripts/AGENTS/PLAN/CONTEXT/*.test.ts/__fixtures__/map、asarUnpack resources + node-pty)+ `build:win` script;**`npmRebuild: false`**(node-pty 1.1.0 自带 N-API prebuilds;本机重编因缺 Spectre-mitigated libraries 直接失败 MSB8040)
  - controller 亲跑验证:typecheck 双投影 0 error;vitest 184 passed/28 files(T10 后 177/26 + 4 通知 + 3 迁移);eslint 本轮改动文件 0 error(唯一 1 条在 pty-registry.ts:139,`git show 5fa46afb:` 核对为 T8 既有,T11 未改该行);build 通过;shouldNotify 变异检查(改 `return !p.focused` → 用例 3/4 转红,还原 4 passed——本轮先写测试后写实现漏跑红步,用变异补齐鉴别力);`build:win` 成功 → dist/Soloport-0.1.0-setup.exe 120MB;asar 核对:`out/main|preload|renderer` 均在、.reference//src//docs//*.test.ts 各 0 条、node-pty 221 条;未安装版启动实测(进程起、迁移日志、`%APPDATA%/Soloport/store.json` = 1 项目/28 会话/theme=system,旧目录保留);产物 CSS 中 dark: 已编译为 `:where(.dark, .dark *)` 24 处
  - 首轮评审(reviewer subagent,对照 .review/T11.patch 833 行,聚焦核实 isTypingTarget 是否存在/state-parser publish/closeTab/overlay 初值):规格符合 ❌,无 Critical;Important 2——①快捷键无输入态守卫且注释引用了**不存在**的 `isTypingTarget`:Ctrl+W 在终端里会 `bridge.pty.kill` 杀 PTY(readline 里 Ctrl+B/E/N/W 都是编辑键),Ctrl+B/E/G/N 同样撞;②`.review/T11.patch` 缺 electron-builder.yml(closing 时易漏提交新文件);Minor 10(settings 不校验值、overlay 全平台调用、色值双份、深色首帧白闪、main.css 注释指错文件、storePath 可选、migrateLegacyStore 不可测、额外快捷键超契约)
  - 修复(controller):Fix-1 两个真实判据 `isTerminalTarget`(closest('.xterm'))/`isEditableTarget` + 规则(终端内仅放行 Ctrl+Tab;输入控件内放行;其余才处理)+ repeat 早退,注释改为指向真实代码;**保留 Ctrl+W 但只在非终端区域生效**(终端内数据丢失路径已封死,普通界面关标签符合预期;复审裁决该取舍成立);Fix-2 patch 重新生成时 `git add -N electron-builder.yml ...`(现 24 个 diff,含 yml);Minor 全修(校验枚举+clamp[1,50000]、平台早退、常量单一来源 TITLE_BAR_OVERLAY_HEIGHT/titleBarOverlayColors、main.tsx 渲染前落类、注释订正、storePath 必填、migrateLegacyStore 抽成 store-migration.ts + 3 用例、额外快捷键登记为用户决定)
  - 复审(reviewer :low,对照 .review/T11-fix.patch):10 项全 ADDRESSED,无新增 Critical/Important,裁决可提交(待用户重新打包 + 安装冒烟);对本轮 App.tsx **事故恢复**做了重点抽查(快捷键 effect/两个上报订阅 effect/ThemeToggle 挂载/Soloport 文案)均通过
  - **事故留痕**:修 Fix-1 时用脚本按「切片替换」改写 App.tsx,因注释位置在前序调整中变过导致切片起止反转(空切片),`str.replace('', block)` 把内容插进了每个字符之间 → 文件被炸成 85 万行;**T11 对 App.tsx 的改动当时未提交**,按 `git show HEAD:` 取回 T10 版本后重新施加 T11 改动,typecheck/eslint/test/build + 逐项 grep 复核通过。教训:改动已有文件优先用 read/replace 工具或整文件 write,不用索引切片拼接
  - 打包后再次实测:重新 `build:win` 成功、未安装版启动正常;日志发现 `new-exists`(首次迁移后必然如此)被当错误打印,已改为只在 `copy-failed` 记日志
  - **冒烟状态(重要)**:用户 2026-11-22 00:31 表示「暂时这样,后面验证」——T11 的 7 项手动冒烟**未执行**,已整理为 `docs/pending-verification.md`(含 T11 七项 + 跨任务遗留:claude/codex/kimi/antigravity 未安装的各项 + 五条已知边界),每条写明理由/验法/判定依据。**故 T11 复选框暂不勾选**,待用户逐条验证通过后补勾并追加验证记录
  - 口径登记:①契约步骤 2「4 failed」实况未单独跑红(先写测试后实现),以变异检查补鉴别力证据 ②步骤 6「86 passed」系门 2 时点,实况 177/26 → 本轮 184/28 ③快捷键落点从契约写的 `src/main/index.ts` 改为渲染层(App.tsx)——`globalShortcut` 是系统级会抢键,契约字面不可用;已在评审中说明并获认可 ④「空态与错误态文案」本任务零改动:前序任务(T4/T6/T9/T10)已逐处落地中文文案,评审确认全仓无英文残留 ⑤`new-exists`/`legacy-missing` 为迁移正常终态,不记错误日志 ⑥额外快捷键(Ctrl+B/E/G/W)超出契约「新建会话、切换标签页」范围,保留并登记,由用户决定去留
  - 下游结论(收尾与后续版本用):①**自定义标题栏**已定:顶部控件须在 drag 区内且自身 no-drag,右侧预留 `env(titlebar-area-width)`;改主题必须同步 `setTitleBarOverlay`(常量在 app-window.ts)②通知判定在主进程,「前台」= 前台会话 && 窗口聚焦;新增事件源要记得只在真实变化时发,seed 不发 ③快捷键在渲染层全局 keydown,凡新增快捷键都要过 `isTerminalTarget/isEditableTarget` 守卫,否则会抢 shell 行编辑键 ④数据目录改名后 `migrateLegacyStore` 会一直以 new-exists 早退,若将来再改名需按同样模式加一条迁移(不要改旧函数)⑤打包:`.reference` 等大件靠 electron-builder.yml 的 files 排除;node-pty 依赖 N-API 预编译故 `npmRebuild: false`,换非 N-API 原生模块时必须装 VS 的 Spectre 库并改回 true ⑥未签名包在 Windows 会弹「未知发布者」,属预期
  - 文档变更登记:新增 `docs/pending-verification.md`(待验证清单,项目文档体系的补充件);四层文档无实质变更(spec 的 shouldNotify 与通知语义一致;brief 的遗留项「应用图标与产品名」:产品名已定 Soloport、图标仍占位并转入待验证清单第 7 条);CONTEXT/ADR/AGENTS 无改动;plan.md 本条(勾选待验证后补)
  - **提交状态**:已提交 6336c31b(代码 25 文件:16 改 + 9 增,含 electron-builder 依赖与 electron-builder.yml;用户 2026-11-22 确认提交,已知冒烟待验证)+ 本条 docs 提交(含新增 docs/pending-verification.md)
- 2026-11-22 00:49 | 变更(shell 基底):终端常驻 shell 默认由 cmd 改为 Windows PowerShell 5.1,并做成可切换
  - 触发:用户提出「现在使用的是 cmd 吧,能换成 powershell 吗」;讨论后用户要求「换成 powershell 试试」(先提交代码保证工作区干净,再改)
  - 决策:`Settings.shell: 'cmd' | 'powershell' | 'pwsh'`(新增必填字段,旧 store.json 由 loadStore 的 DEFAULT_STORE 合并补默认);**DEFAULT_STORE 默认 'powershell'**(按用户要求),切回 cmd 只需改 store.json 的 settings.shell(暂无设置界面,登记为建设项)
  - 实现(ADR-0004 语义不变:PTY 仍跑常驻 shell、agent 在 shell 内启动、退出回提示符):`pty-registry.ts` 新增三个纯函数接缝——`quotePowerShellArg`(单引号字面量,内部单引号双写)、`buildPowerShellLaunchScript`(chcp 65001 + `[Console]::OutputEncoding` + `& 'agent' 'args'`)、`buildShellSpawnArgs`(cmd→[];powershell/pwsh→`-NoLogo -NoExit -Command <script>`)、`buildShellInjectLine`(cmd→注入行含 CR;非 cmd→null)、`resolveShellExecutable`(cmd 走 ComSpec;其余用解析到的绝对路径,缺省退回裸名);spawn 载荷增可选 `shell`,`ipc/pty.ts` 从 `store.settings.shell` 传入;`settings.applyPatch` 增 shell 枚举校验
  - **关键设计(为什么不用「写注入行」)**:powershell.exe 冷启动 300-700ms 且可能加载 profile,cmd 那套「spawn 后立刻 write 一行」会丢行;故非 cmd 把 agent 命令直接放进 `-Command` 启动参数,无时序问题。`-NoExit` 保证 agent 退出后 shell 仍在(等价于 cmd 的交互保留语义)。PowerShell 里必须用调用运算符 `&`——直接写 `"path" args` 只会打印字符串不执行
  - 验证:三个新纯函数补 6 条测试(mutation check:去掉 `&` → 3 条精确转红,还原 22 passed);**node-pty 真实探针**(临时文件已删,扮 agent 的 .cmd + 含空格参数路径)三项全绿:agentRan=true、argsIntact=true(PS 5.1 把含空格路径作为单参数正确传入)、shellAlive=true(agent 退出后 PS 提示符仍在并接受 `echo` 输入);typecheck 双投影 0 error;vitest **190 passed / 28 files**;build 通过;eslint 本轮改动文件无新增 error(pty-registry.ts 的 `\"` 与 test 里 `D:\demo-project` 两处经 `git show HEAD:` 核对为既有债务)
  - 口径登记:①PS 5.1 对原生命令的参数引号有已知缺陷(引号内嵌/结尾反斜杠;PS 7.2+ 才有 `$PSNativeCommandArgumentPassing`),本机探针覆盖了「含空格参数」这一实际场景,残余风险记入待验证清单 ②`pwsh` 未安装,选择后 resolveCommandPath 返回 null → 退回裸名 `pwsh.exe` → node-pty 报错,如实暴露,不做额外兜底 ③`Settings.shell` 为必填:三个测试夹具同步补 `shell` 字段(形状变更的正常代价,不放宽断言) ④迁移后的 store.json 已含 `shell: 'powershell'`(loadStore 合并默认值),无需手工改
  - 文档变更登记:`docs/pending-verification.md` 新增「一之二、终端 shell 换成 PowerShell」七项待验证(含改回 cmd 的方法);本条 dev 记录
  - 下游结论:①换 shell 只影响「agent 退出后你回到的提示符」;agent 的 TUI/滚轮/尺寸/状态点走 ConPTY 与 xterm,与 shell 无关 ②新增 shell 种类时改 `resolveShellExecutable` + `buildShellSpawnArgs`(+ 可能 `buildPowerShellLaunchScript`),并同步 `SHELLS` 校验枚举 ③若将来做设置界面:写 `settings.shell` 即可,注册表读的是 `store.settings.shell`(每次 spawn 现取,不需重启) ④终端内按键守卫按 `.xterm` 判断,与 shell 无关,换 shell 不影响快捷键边界
- 2026-11-24 12:11 | 需求变更(用户提出并确认方案):新建会话初始名 = agent 显示名,回填拿到 externalSessionId 后用 agent 侧标题更新会话名
  - 动机:新建会话立即以「Pi」等 agent 名命名,信息量为零;agent 侧标题(首条用户提示等)扫描器本就解析(`ImportCandidate.externalTitle`),只是回填写回时被丢弃
  - 实现(7 文件):①`backfill.ts` 新增 `pickBackfillTitle`(写回判定纯函数:候选有非空标题且记录仍为默认 agent 名才采用,用户手动改名不覆盖)+ `BACKFILL_TITLE_GIVE_UP_MS = 120_000` + `pollForTitle`(标题补捞轮询:pi 启动即建文件、标题晚于文件出现,按已知 id 精确匹配候选接力捞标题,节流沿用回填档位、2 分钟放弃;release 随资格释放一并中止)②`ipc/pty.ts` 回填写回段扩为 id + 转录路径 + 标题,补捞到手后重查记录存在性与改名守卫再写;每次写回广播 `sessions:changed`③契约新增下行通道 `sessions:changed`(载荷 = Session),preload 暴露 `sessions.onChanged`④渲染层 `sessions-slice.applyExternalUpdate`(复用 upsertSession 原位替换)+ App.tsx 订阅,侧栏即时跟随
  - 关键设计:标题补捞不复用回填 scan 闭包(known 集合会排除已写回 id,复用即永远捞不到),独立按 id 过滤,不做新鲜度护栏(id 已锁定不存在串线,不需资格);写回前后双重守卫(发现时 + 补捞到手时)防覆盖用户命名与悬空写回
  - 测试:backfill.test.ts 新增 7 条(写回判定 3 + 补捞轮询 4);mutation check 留痕:去掉改名守卫 → 「用户已手动改名」用例精确转红 → 还原 22 passed
  - 验证:typecheck 双投影 0 error;vitest 247 passed / 36 files(基线 244 + 本轮 7,自洽;`pty-registry.kill-tree.test.ts` 3 条在沙箱内因 tasklist 拒绝访问失败,git stash 基线复跑同样失败,坐实为沙箱环境限制非本改动);`pnpm build` 通过(T9 白屏教训:渲染层改动必过 build);eslint 改动文件 0 error
  - 口径登记:①`Session.externalTitle`(agent 侧原名,认亲用)本轮不写——导入记录有值、自建回填记录保持空,如需对齐另立小改 ②初始名保留 agent 显示名不改「未命名」:回填失败时 agent 名仍有信息量 ③claude/codex 发现文件时标题已存在(首条消息后才建文件),补捞主要服务 pi 这类启动即建文件的 agent;kimi/antigravity 标题行为本机未装,装后复核
  - 环境事故(留痕):本轮沙箱内 node_modules 128234 个文件 ACL 损坏(tsc/vitest 入口等读不了,icacls 查询被拒),经用户授权 `icacls node_modules /reset /t /c` 沙箱外重置后恢复;损坏疑源为 2026-11-24 11:10 那次 `pnpm install`,若复发优先排查该次安装
  - 文档变更登记:`docs/pending-verification.md` 新增「五、会话名随回填自动更新」R1–R4 待验证;本条 dev 记录
  - 提交状态:已提交 121cd58f(用户拍板跳过冒烟先行入库,2026-11-24);实机验证 R1–R4 转 TODO.md 跟踪(本行为 2026-11-25 记账修正,原「未提交」已过期)
- 2026-11-25 | T11 收尾:安装冒烟七项实机验证通过,勾选补记
  - 用户按 docs/pending-verification.md 一、1–7 逐条实机验证通过(安装启动/数据迁移/打包版 PTY/主题三态/快捷键/等输入通知/应用图标);应用图标此前已换透明版品牌 S 标(eb6a1af6)并重新出包;T11 补勾,brief 7.1「打包产物可安装启动」达成
- 2026-11-25 | D5 结案:保存队列条目清理(T1 评审 Minor「留 T4 复用接缝时顺手自清」兑现)
  - store-persistence.ts:尾随 promise settle 后引用比较清理(saveQueues.get(file) === tail 才 delete;期间新保存进队则让位,绝不误删活跃队列);新增 hasQueuedSave 测试可观测点(最小查询,不暴露 Map 本体);守卫用例 1 条(保存完成后 Map 留空)+ 并发用例补队列残留断言;mutation check 留痕(去清理 → 恰 2 红;还原 14 绿);全量 44 文件/305 用例绿、typecheck 双投影 0 error
<!-- 四层文档的任何改动都在这里另行留一行 -->
