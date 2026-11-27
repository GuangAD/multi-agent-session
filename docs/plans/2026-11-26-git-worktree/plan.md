# Git worktree 会话 · 切片

> 2026-11-26 | 状态:已确认

## 任务

- [x] **T1 会话运行目录与面板跟随**
      交付:右栏文件树、Git 面板与「在 VS Code 打开」跟着当前活动会话的目录走;无活动标签回落到选中项目;会话记录结构具备 worktree 指针(暂无人写入)。不涉 worktree 的任何创建动作。
      挡谁:T2、T4

- [x] **T2 worktree 建链路(后端到记录)**
      交付:经桥接建出一个 worktree——磁盘出现目录、`.worktree/` 已写进本机排除文件、会话记录带 worktree 三项、该会话的终端在 worktree 目录里启动。DevTools 里调桥接即可演示。
      挡谁:T3、T4

- [x] **T3 删链路:删会话连带删 worktree**
      交付:删带 worktree 的会话时目录一起消失;有未提交改动则拒绝并回传 git 原文;带强制参数才强删;目录已被手工删掉时清掉 git 的残留登记、幂等成功。
      挡谁:T5

- [x] **T4 侧栏入口与建 worktree 弹窗**
      交付:仓库根项目在「更多」菜单里出现「新建 worktree」,其余项目没有;弹窗内选起点分支、填名称、点 agent,一次动作把目录与标签页会话一起做出来;冲突与 git 失败在弹窗内显示。
      挡谁:T5

- [x] **T5 会话行分支小字与强制删除二次确认**
      交付:worktree 会话在侧栏标题下多一行分支名;删有未提交改动的这类会话时,第一个确认框显示 git 原文,再给「强制删除」二次确认。
      挡谁:无

- [x] **T6 收尾:冒烟暴露的两条跨特性问题 + 终审 4 条 P2**
      交付:hook 注入不再把 worktree 弄脏(四个顶层注入目录一并写进本机排除文件),干净 worktree 会话可以不带强删直接删掉;worktree 会话的回填扫描走会话运行目录、资格按 worktree 区分,重开能真的续接且不再拖累同项目的普通会话;强删再失败给出终点;前缀判定归一 `..`;弹窗提交期有可见反馈且可关闭。
      挡谁:无(收尾任务,来自门 3 冒烟)

## 依赖

T1 → T2 → T3 → T4 → T5 串行。T3 与 T4 都只硬依赖 T2,但按阶段 4 的纪律串行执行;T5 的用例需要 T3 的拒绝信号与 T4 的入口才能跑绿,故 T5 排最后。

T1 是前置改动:它先把「会话 → 运行目录」这条来源建起来并把面板从「选中项目」解耦。之后 T2 只需往这条来源里填 worktree 路径,不必再回头改面板与终端。

## 遗留项

brief 第 6 节只有一件欠账:强制删除确认框与各处报错的具体措辞。落在 T5 定稿,最迟门 3 冒烟时定。定不下来时按 brief 第 2 节失败形态逐条核对文字,不影响任何行为。

- `panel-root` 用例 8 未覆盖「活动会话带 worktree 且所属项目已删」的最坏形态(T1 评审 Minor 3):实现走同一分支,风险低;门 3 终审再定是否补。
- 预览标签激活时,右栏面板仍跟随上一个终端会话的目录(T1 评审 Minor 4):spec 未表态,属既有标签语义的自然延伸,登记备查。
- `parseWorktreeList` 按 `\r?\n` 切行,项目路径含换行时就算不过(T2 复审 P2-2):Windows 目录名不可能含换行,当前不可达;若日后支持 macOS/Linux,改 `worktree list --porcelain -z`。
- `dirKey` 只做斜杠与 win32 大小写归一,无 realpath(T2 复审 P2-5):**平台前提确定为 Windows 首发**(打包目标只有 `electron-builder --win`,macOS 不在支持范围)。同一 gate 覆盖不到的另一症状:项目本身若是 linked worktree(`.git` 是文件)时排除文件写不进去,只在日志里告警。
- 会话记录里 worktree `path` 存的是 `path.join` 的反斜杠形式,与 `shared/types.ts` 注释「归一化存储」措辞不一致(T2 评审 Minor-3):`dirKey` 已兜住所有比较,暂无功能影响;改动它会牵动未来 spawn cwd 与两个面板,留到有实际需求时再统一。
- T3 待办(T2 评审 Minor-6):`remove` 删会话但**保留分支**,之后用同名再建 worktree 会撞 `branch already exists`,落 `git-error` 原文。是否在 T3 加「分支已存在」的友好提示,由 T3 处理时定。
- 断链 worktree 无出口(T3 第三轮复审实测):`<worktree>/.git` 文件被删/损坏时,`git worktree list` 仍列出该条目(附 `prunable` 行),而 `git worktree remove` 带不带 `--force` 都失败(`validation failed … '.git' does not exist`),登记也摘不掉 → 该会话在应用里永远删不掉。门 3 冒烟时按此形态核一遍,再定是否给 `prune` 前置。
- T5 要补的显示语义(T3 第三轮复审):`sessions.remove` 在 worktree 清不掉时**不抛**,只回 `worktreeError`;而 `sessions-slice.removeSession` 现在只看 `closedTabs`,会把该会话从列表移除并关标签页(界面「假删成功」,`sessions:list` 之后又冒出来)。T5 必须让失败分支保留记录。
- `removeWorktree` 的 `skip` 分支 `rm` 非原子:目录内某文件被占时会先删掉一部分再抛错(T3 复审)。已用 `forceWorktree` 闸门把这条限制在用户确认之后,但「半删」本身无法避免,登记备查。
- `sessions:remove` 的 800ms 重试不看错误性质(T3 复审):有未提交改动时也会白等一次再跑同一句 `contains modified or untracked files`;且这条路径会先杀掉用户的 agent 终端却回 `closedTabs: []`。T5 的二次确认要能解释「标签页已死」。
- 三处重复小件(T3 评审 Minor-3):`runGit`(`ipc/sessions.ts` / `ipc/worktree.ts`)、`pathExists`(同两处)、`errorMessage`(同两处)。合并时不必新建 utils 目录,从 `git-worktree.ts` 导出即可。
- `pathExists` 用 `stat` 不辨文件与目录(T3 评审 Minor-4);`session` 快照在 `await` 前后各取一次会更严格(T3 评审 Minor-5)。
- 删项目仍会留下 worktree 目录(T3 评审 Minor-6,已核实):`ipc/projects.ts` 走 `sessionRecords.removeByProject`,既不清 `<项目>/.worktree/*` 也不摘 git 登记,下次同名创建会撞 `dir-exists` 得手工删。与 brief 第 2 节「移除项目不删磁盘目录」一致,但残留下次会挡创建,登记备查。
- `createWorktree` 与 `openSession` / `reopenSession` 三处同构(T4 评审 Minor-3):`pendingSpawns.set` + `upsertSession` + `tabs` + `activeTabId` 四步逐行等价,建议后续抽 `openTabWithPendingSpawn`,本特性不动以免扩大差异。
- `WorktreeDialog.tsx` 的界面行为(置灰、Esc、错误区、分支为空提示)无自动化用例(T4 裁定 A):靠门 3 冒烟,门 3 清单里四条分别在「名称非法 / 分支已存在 / 目录已存在 / 未安装置灰与 Esc」。
- 用户在二次确认里点「取消」时,该会话的 PTY 已经在主进程被杀了(T3 的「先杀再清」顺序),目录与记录都在但终端已死(T5 评审 M-3)。修点在主进程顺序(先清、失败再杀),留给后续任务;门 3 冒烟时按此形态观察一次。
- `SessionRow` 的分支行没有 `onDoubleClick`:双击分支名会走点击的 200ms 延时打开会话,而不是重命名(T5 评审 M-5)。行为不坏,登记备查。
- 排除文件的四条 hook 目录不带前导斜杠,按 gitignore 语义在任意深度匹配,故**主工作区**里用户自建的同名未跟踪目录也会一起从 `git status` 消失(`git add .` 跳过,需 `-f`)(T6 评审 Important-1)。取舍:这些目录本就是本应用 hook 注入的产物,已跟踪文件不受影响;要收窄可改锚定写法 `.worktree/*/.claude/`,代价是主工作区重新出现四个未跟踪目录。条目写入后不回收。
- `codex` / `antigravity` / `kimi` 的 scan 忽略目录、扫全局池(T6 评审 Important-3):`sameBackfillSpot` 对这三家只是放宽而非隔离,同项目下普通会话与 worktree 会话会同时拿资格、扫同一池子,理论上可能写回同一个 `externalSessionId`(该风险在跨项目场景本来就存在,非本次引入)。
- 导入会话(`ipc/sessions.ts` → `session-import`)仍按项目路径扫描(T6 评审 Minor-9):worktree 目录里的历史 transcript 不会出现在「导入历史会话」的候选里。与回填同源问题,但属既有分工,未在本特性处理。

## 开发记录

- brief 7.2 第二条落地为两个纯函数(`session-dir` + `panel-root`) | 登记:目录来源被面板与终端 spawn 两处共用,拆成底层「会话目录」与会话级「面板选择」;不是新增接缝,是同一条的细化
- 界面测试裁定(A) | 本特性不引入组件测试依赖与双环境配置;面板与弹窗的界面验证由门 3 冒烟承接,T4 契约补四条冒烟步骤(名称非法 / 分支已存在 / 目录已存在 / 未安装置灰与 Esc)
- 门 2 通过 | 2026-11-26 用户批准 plan / spec / tasks,提交后暂停(用户要压缩会话);下一个动作 = 开工前接口预检,然后 T1
- 开工前接口预检 | 2026-11-26 完成。核对对象:spec 的模块划分与接口面清单 × 五份任务契约 × 现有代码(`git-service.ts`、`session-records.ts`、`sessions-slice.ts`、`ipc/sessions.ts`、`ipc-contract.ts`、`preload/index.ts`、两个 tsconfig、`vitest.config.ts`)
  - 发现 1(已改):执行器签名缺 root,与 T3 的 `remove({root,…})`、`prune(root)` 对不上。裁定 `GitRunner = (root, args) => Promise<string>`,root 由每个动作自带;改动落 spec 技术选型与 T2 伪代码。
  - 发现 2(已改):`WorktreeService` 的成员签名原本只有 T3 给了 remove/prune。裁定全量成员写进 T2(`isRepoRoot` / `list` / `add`,均带 root),T3 只增两个。
  - 发现 3(已改):spec 写「五个纯函数」,T3 之后是七个;模块依赖也从「直连 simple-git」改为「注入执行器」。
  - 发现 4(登记):brief 第 5 节 [我] 写的是「落在既有 git 服务层」,spec 原写独立模块直连 simple-git。取中间:`GitRepo` 加 `raw` 保住单一 simple-git 实例与 root 缓存,worktree 的纯逻辑与编排另立 `src/main/git-worktree.ts`。属 brief 第 8 节授权项(落点与内部拆分)。
  - 发现 5(无需改):`SessionWorktree` 不含 root;删会话时的 root 由 `session.projectId` 反查项目路径取得,与 T3 契约一致。
  - 测试基座:`src/shared/session-dir.test.ts`(node 投影含 `src/shared/**`)、`src/renderer/src/panel-root.test.ts`(web 投影含 `src/renderer/src/**`),均落 vitest 的 `src/**/*.test.ts`;T2/T3 共用的 `src/main/git-worktree.test.ts` 用七个互不重叠的 `-t` 过滤(名称 / 排除文件 / worktree 列表 / 冲突 / 服务 / 删除动作 / 清理 worktree),收尾条数 T2 16 + T3 5 = 21 自洽。
  - BASE:T1 开工前 `pnpm test` 48 文件 352 用例全绿;`pnpm typecheck` 双投影 0 error。
- **T1 会话运行目录与面板跟随** | 形态 L2(读数 10% 时派发 implementer) | commit `feat(T1): 会话运行目录收成单一来源并让面板跟随`(`ef9444da`)
  - 落地:`SessionWorktree` + `Session.worktree?`(`shared/types.ts`);`resolveSessionDir`(`shared/session-dir.ts`);`resolvePanelRoot`(`renderer/src/panel-root.ts`);`App.tsx` 算 `panelRoot` 下传两个面板与「在 VS Code 打开」;两个面板删掉各自查选中项目的代码,重挂 key 从项目 id 改为根目录。
  - 验证:全量 50 文件 360 用例绿(BASE 352 + 新增 8);`pnpm typecheck` 双投影 0 error。
  - 评审:独立 reviewer,双裁决通过(规格 ✅ / 质量通过),0 Critical / 0 Important。
  - 处置:Minor 1(`App.tsx:54` 注释仍写 `${projectId}:${tick}`)已改;Minor 2(注释把「终端 cwd 已接入」写成现状)已改为「待 T2 接入」;Minor 3、4 记入遗留项。
  - 契约修订:步骤 12 的 Expected 由 `Tests 5 failed (5)` 改为 `Tests 4 failed | 1 passed (5)`——骨架恒返回 null 时用例 7(期望正是 null)结构上必绿;属 plan/契约级修订,未触及 brief。
  - 下一步用得上的结论:`resolveSessionDir` 的 `project` 必须是会话所属项目,不能猜;面板重挂 key 现在是根目录,T4/T5 加面板状态时不要假设 key 恒等于项目 id;spawn cwd 的唯一落点是 `sessions-slice.ts` 两处 `pendingSpawns.set`(T2 步骤 29)。
- **T2 worktree 建链路** | 形态 L2(派发 implementer) | commit `feat(T2): 建 worktree 并落会话记录`
  - 落地:`src/main/git-worktree.ts`(四个纯函数 + 可注入执行器的服务 + `dirKey` 路径归一)、`src/main/ipc/worktree.ts`(两通道编排:名称先挡 → 仓库边界 gate → 三样事实 → 冲突判定 → add → 写排除 → 落记录)、`GitRepo.raw`、`sessionRecords.create` 加可选 worktree、`shared/ipc-contract.ts` 三个类型与两通道名、`main/index.ts` 注册、preload 暴露、`sessions-slice` 两处 cwd 改走 `resolveSessionDir`。
  - 验证:全量 51 文件 386 用例绿(BASE 352 + T1 8 + T2 原 19 + 评审守卫 5 + 复核守卫 2);`pnpm typecheck` 双投影 0 error;eslint 无输出。
  - 评审:独立 reviewer 初审(0 Critical / 2 Important / 6 Minor)+ 新上下文复审(通过,0 阻塞,5 条 report-only)。
  - 契约修订:步骤 3/7/11/15 的 Expected 由 `3/4/3/4 failed` 改为 `2/3/2/3 failed | 1 passed`——同一骨架悖论(每组恰有一条用例的期望就是骨架行为)。spec 的「七个纯函数」改为「六个函数级接缝」。
  - 处置:Important-1(编排层无 `isRepoRoot` gate,子目录项目会「建成功但排除文件从未写入」)已加 gate;Important-2(porcelain 非 ASCII 路径引号)按**实测推翻**——git 2.46 对含中文/空格的 worktree 路径不加引号不做转义(临时仓库实测),且 `git-worktree.html` 的 Porcelain Format 段说明只有 lock reason 会被 quote,故非缺陷;Minor-1(名称校验漏 `//`、`.lock`)与复审 P2-3(应逐段判)已改为逐段校验;Minor-2(`appendExclude` 把读失败当空串可能覆盖用户条目)已改为仅 ENOENT 回落;复审 P2-1(gate 文案说死)已改;复审 P2-4(`isRepoRoot` 零守卫)已补三条假执行器用例。
  - mutation check 留痕:`.lock`→`.locked` 与 `//`→`///` 各使对应守卫用例转红后还原;`isRepoRoot` 的 `===`→`!==` 使两条用例转红后还原(最终整文件 23 passed)。
  - TDD waiver:`src/main/ipc/worktree.ts` 编排层无自动化用例(需 electron `ipcMain` + fs 打桩,成本与收益不成比例;同层 `ipc/git.ts` 亦无单测),靠门 3 冒烟与 gate 的 `isRepoRoot` 单测兜底。步骤 32 的 DevTools 演示未做(无 Electron 环境),留门 3。
  - 下一步用得上的结论:真实环境 git 回正斜杠而 `path.join` 给反斜杠,任何新增的路径比较都必须经 `dirKey` 归一;T3 只需往 `WorktreeService` 加 `remove`/`prune`;T4 调 `bridge.worktree.create` 成功后用返回的 `session` 开 tab 即可(cwd 已统一走 `resolveSessionDir`)。
- **T3 删链路** | 形态 L2(派发 implementer + 三轮评审) | commit `feat(T3): 删会话连带删 worktree`
  - 落地:`git-worktree.ts` 加 `RemovalAction`、`pickRemovalAction`、`removeWorktree`(探事实 → 选动作 → 执行;不抛,失败折成 `{ok:false, error}`),`WorktreeService` 加 `remove({root,path,force})` 与 `prune(root)`;`SessionsApi.remove` 加 `options.forceWorktree` 与 `worktreeError`;`ipc/sessions.ts` 的 handler 改 async:有存活 PTY 先 `ptyRegistry.kill`,再清目录,清不掉就原样回错误且记录/回填资格/落盘全不动,`killedPty` 以「先读一次 activeIds」替掉;`preload` 透传 `options`。
  - 验证:全量 51 文件 400 用例绿(BASE 352 + T1 8 + T2 24 + T3 16);`pnpm typecheck` 双投影 0 error;eslint 无输出。
  - 评审:三轮(初审 0 Critical / 2 Important / 8 Minor;复审 2 条 P1;第三轮通过 + 遗留清单)。三轮都由独立 reviewer 裁决。
  - 实测取证(git 2.46.0.windows.1,临时仓库):脏 worktree 无论有没有进程占目录,`worktree remove` 都以 `contains modified or untracked files` 拒绝且**登记不摘**;干净 worktree 被进程 cwd 占住时,`remove` 报 `failed to delete …: Permission denied` 但**登记已被摘掉**——这正是「目录在、git 不认」这一状态的来源,也是「先杀 PTY」与「skip 分支自删」两条设计的依据。
  - 处置:Important-1(`dirExists && !registered` 会删记录留孤儿)改为「对本项目 `.worktree/` 下的路径由应用自己删,别处拒绝」;复审又补了「删除前必须 `forceWorktree`」的闸门(该分支已无 git 脏检查兜底,且 `rm` 非原子);Important-2(删正在跑的会话被目录锁挡住)改为先 `ptyRegistry.kill` 再清目录,并对首次失败(仅原本有活 PTY)等 800ms 重试一次;`list` 抛错时若目录也不在则幂等成功,解掉「项目目录被删后会话永远删不掉」的死锁;`removeDir` 由可选改必填。
  - 契约修订:步骤 8 的 Expected 改 `2 failed | 1 passed`(空骨架使「都不在→跳过」必绿);步骤 15 的条数按实测改为 37;`removeWorktree` 伪代码补 `removeDir` 与「第四种组合」;测试规格表补 #6–#13。
  - mutation check 留痕:`--force` 实参改成恒不带 → force 用例转红后还原;`if (!p.force)` 改成 `if (false)` → 「未给 force 拒绝」用例转红后还原。
  - TDD waiver:`ipc/sessions.ts` 的删除编排(杀 PTY、800ms 重试、activeIds 快照)仍无自动化用例,与 T2 同因(需 electron + pty 打桩);靠门 3 实机冒烟(含「删一个正在跑 agent 的 worktree 会话」)兜底。步骤 12–14 的 DevTools 演示未做。
  - 下一步用得上的结论:失败时 `worktreeError` 存在而 `closedTabs` 恒为空,记录与 PTY 都未被触碰(PTY 可能已被主动杀掉,见遗留项);`bridge.sessions.remove(id, { forceWorktree })` 已通到主进程;`WorktreeService` 的假服务样板在 `git-worktree.test.ts` 的 `createFakeService`,T4/T5 可直接复用。
- **T4 侧栏入口与建 worktree 弹窗** | 形态 L2(派发 implementer + 一轮评审) | commit `feat(T4): 侧栏入口与建 worktree 弹窗`
  - 落地:`ui-slice` 的 `worktreeDialog` / `openWorktreeDialog` / `closeWorktreeDialog`;`sessions-slice.createWorktree`(成功先登记待 spawn 再入列开 tab,失败原样回传且 store 与 pendingSpawns 都不动,桥接 rejection 归 `git-error`);新增 `components/sidebar/WorktreeDialog.tsx`(分支下拉 + 名称 + agent 置灰 + 错误区 + Esc/遮罩关闭,按 `project.id` 设 key 归零);`MoreMenu` 打开即探 `isRepoRoot`,`=== true` 才渲染菜单项;`App.tsx` 挂载弹窗。
  - 验证:全量 51 文件 406 用例绿(BASE 352 + T1 8 + T2 24 + T3 16 + T4 6);`pnpm typecheck` 双投影 0 error;eslint 0 error。
  - 评审:独立 reviewer,0 Critical / 1 Important / 4 Minor。
  - 处置:Important(`MoreMenu` 的测量 effect 只依赖 `anchor`,探测回填后插入一行会使坐标陈旧——翻上方压住触发按钮、向下可能越出视口)已把 `isRepoRoot` 加进依赖;Minor「空仓库静默死路」已加提示;Minor「分支读取失败误用创建失败文案」已拆成独立 `branchesError`;Minor「`submit` 无 `finally`」已改 try/finally;Minor「`createWorktree` 与 `openSession` 三处同构」记入遗留。
  - 契约修订:步骤 3 由「关弹窗 → 调 create」纠正为「调 create → 成功才关」(原稿与「处理 5:失败保持打开」自相矛盾);测试规格补第 6 行(桥接抛错归 `git-error`)。
  - 下一步用得上的结论:弹窗的错误区收口在 `FAILURE_LABEL` + detail 一处,T5 定稿文案只改这个 Record;创建成功由弹窗自己关、失败保持打开,删除侧的二次确认不要复用这个实例;`MoreMenu` 的探测是「每次打开一次」,依赖它随 `moreOpen` 卸载/挂载。
- **T5 会话行分支小字与强制删除二次确认** | 形态 L2(派发 implementer + 一轮评审) | commit `feat(T5): 分支小字与强制删除二次确认`
  - 落地:`sessions-slice.removeSession` 改为返回 `RemoveSessionResult`(成功 / `kind:'worktree'` 被挡住 / `kind:'transport'` 调用失败),`worktreeError` 非空时提前返回、列表与标签页都不动,`options` 原样透传给桥;`SessionRow` 标题下加分支小字(仅 worktree 会话);`Sidebar` 删除确认扩成三态(confirm → force → failed)复用同一个 `ConfirmDialog`,取消任一步只关框;`ConfirmDialog` 加可选 `busy`(忙碌期禁点两个按钮),`WorktreeDialog` 的 `FAILURE_LABEL` 文案定稿(brief 第 6 节欠账结清)。
  - 验证:全量 51 文件 410 用例绿(BASE 352 + T1 8 + T2 24 + T3 16 + T4 6 + T5 4);`pnpm typecheck` 双投影 0 error;eslint 无新增问题。
  - 评审:独立 reviewer,0 Critical / 1 Important / 5 Minor。
  - 处置:Important(`submitRemove` 的异步收尾没有身份校验——用户取消后会被失败结果重新弹回,成功结果还会关掉别人刚打开的框)改为带 `current.session.id` 校验的函数式更新;Minor「传输失败被塞进 `worktreeError` 会给出错误的强删文案」按 `kind` 拆开(failed 态只报原文、按钮改「知道了」);Minor「`removing` 闩是静默单例」改为 `ConfirmDialog` 的 `busy` 禁用态;其余三条记入遗留。
  - 契约修订:`removeSession` 的返回类型由两态改为三态(加 `kind`),测试规格补第 4 行(桥接拒绝 → `transport`)。
  - mutation check 留痕:把 transport 分支的 `message` 改成固定字符串 → 桥接拒绝用例转红后还原。
  - 下一步用得上的结论:`removeSession` 现在必须按返回值决定是否提示,`void removeSession(...)` 会静默吞掉「被挡住」;删除往返期间确认框会保持打开并禁点(busy),门 3 冒烟时「取消后框不该自己弹回来」这条值得单独点一遍。
- **T6 收尾:两条跨特性问题 + 4 条 P2** | 形态 L2(派发 implementer + 一轮评审) | commit `fix(T6): 修掉 hook 注入弄脏 worktree 与回填扫描路径`
  - 落地:`WORKTREE_EXCLUDE_ENTRIES`(五个条目)+ `buildExcludeContent(existing, entries)` 逐条幂等追加;`ipc/pty.ts` 两处扫描改走 `resolveSessionDir`;`backfill.ts` 导出 `sameBackfillSpot`(加 worktree 一维)并接进 `claim`;`Sidebar` 的 `force` 再失败切 `failed` 态;`dirKey` 先 `resolve()`;`WorktreeDialog` 提交期显示「正在创建…」、Esc/遮罩放行、`unmounted` 守卫 + 关窗后失败落控制台。
  - 验证:全量 51 文件 417 用例绿(410 + 本任务 7 条);`pnpm typecheck` 双投影 0 error;eslint/prettier 干净。
  - 评审:独立 reviewer,0 Critical / 3 Important(均为注释与遗留登记级)/ 10 Minor;按处置全部落地或登记。
  - 实测依据:H1 由冒烟证实(worktree 内 `git status` 非空 → `worktree remove` 拒绝);A 方案在临时仓库实测有效(写入排除后 worktree 内 status 为空、`remove` 不带 `--force` 成功)。
  - mutation check 留痕:`sameBackfillSpot` 骨架恒 `true` → 「不同 worktree」用例转红;`dirKey` 去掉 `resolve()` → `..` 绕过用例转红(恢复后 41 条全绿)。
  - 未做自动化:`ipc/pty.ts` 两处扫描接线、`Sidebar` 的 force→failed、弹窗提交期行为(grep 断言 `scan(project.path)` 已无残留)。
  - 下一步用得上的结论:干净 worktree 的删除门槛现在只剩 git 自己的脏检查,门 3 复验 E1 应能不带强删直接过;`sameBackfillSpot` 的字面比较依赖「worktree 路径只有 path.join 一个构造点」,若日后支持接管既有目录需改归一比较。


<!-- 四层文档的任何改动都在这里另行留一行 -->
<!-- 跨特性仍生效的判断登记到根目录 DECISIONS.md,不在这里留 -->
