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
- [ ] **T6 会话导入:框架与 claude/codex**
      交付:对装 claude/codex 的项目导入,历史会话出现;点击拉起与新建一致;重复导入去重;删除后不再被扫回
      挡谁:T7(其余三家适配复用导入框架)
- [ ] **T7 会话导入:pi/kimi/antigravity 适配**
      交付:5 个 agent 的历史会话都能导入(存储路径本机实测核对)
      挡谁:无
- [ ] **T8 回填与自动续接**
      交付:自建会话重开自动续接对话;并发资格规则与禁止双开生效;五家 resume 参数核对通过
      挡谁:无
- [ ] **T9 文件浏览**
      交付:右侧文件树展开浏览,点击只读查看,大文件截断提示
      挡谁:无
- [ ] **T10 Git 面板**
      交付:改文件出差异、按文件暂存提交、切本地分支
      挡谁:无
- [ ] **T11 打磨与打包**
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
  - **提交状态**:已提交 3919cbdc(代码与冒烟修复合并,24 文件:13 改 + 11 增,commit 信息待用户确认);review diff `.review/T5.patch`、`.review/T5-fix.patch` 提交后删除
<!-- 四层文档的任何改动都在这里另行留一行 -->
