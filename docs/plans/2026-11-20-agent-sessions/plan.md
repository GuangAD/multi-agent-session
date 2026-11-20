# Agent Sessions · 切片

> 2026-11-20 | 状态:已确认

## 任务

- [x] **T1 骨架与项目持久化**
      交付:开发模式出三栏窗口(左栏右栏可收起);添加目录后重启列表仍在;typecheck 与 vitest 全绿
      挡谁:T2、T3、T4、T5、T6、T7、T8、T9、T10、T11(IPC 框架、shared 契约与测试基座是全部后续任务的地基)
- [ ] **T2 agent 配置层与安装检测**
- [x] **T2 agent 配置层与安装检测**
      挡谁:T3(建会话需按定义拉起)、T5(状态引擎按 agentId 取规则)、T6、T7(导入按 agentId 找扫描器)、T8(resume 按 agentId 构造参数)
- [ ] **T3 PTY 注册表与会话终端**
      交付:选择 agent 新建会话,终端可交互;关标签页进程即止;应用退出无孤儿进程;采样开关可落盘
      挡谁:T4(会话记录与标签页绑定)、T5(状态引擎吃 PTY 数据流)
- [ ] **T4 会话记录与侧栏**
      交付:重启后会话列表在;重开原样拉起;重命名/删除(确认+连带关标签页)生效
      挡谁:T5(状态点渲染在会话行)、T7(导入列表挂在会话区)、T8(重开流程接 resume)
- [ ] **T5 状态识别三源引擎**
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
<!-- 四层文档的任何改动都在这里另行留一行 -->
