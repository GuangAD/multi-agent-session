# Git worktree 会话 · 切片

> 2026-11-26 | 状态:已确认

## 任务

- [x] **T1 会话运行目录与面板跟随**
      交付:右栏文件树、Git 面板与「在 VS Code 打开」跟着当前活动会话的目录走;无活动标签回落到选中项目;会话记录结构具备 worktree 指针(暂无人写入)。不涉 worktree 的任何创建动作。
      挡谁:T2、T4

- [ ] **T2 worktree 建链路(后端到记录)**
      交付:经桥接建出一个 worktree——磁盘出现目录、`.worktree/` 已写进本机排除文件、会话记录带 worktree 三项、该会话的终端在 worktree 目录里启动。DevTools 里调桥接即可演示。
      挡谁:T3、T4

- [ ] **T3 删链路:删会话连带删 worktree**
      交付:删带 worktree 的会话时目录一起消失;有未提交改动则拒绝并回传 git 原文;带强制参数才强删;目录已被手工删掉时清掉 git 的残留登记、幂等成功。
      挡谁:T5

- [ ] **T4 侧栏入口与建 worktree 弹窗**
      交付:仓库根项目在「更多」菜单里出现「新建 worktree」,其余项目没有;弹窗内选起点分支、填名称、点 agent,一次动作把目录与标签页会话一起做出来;冲突与 git 失败在弹窗内显示。
      挡谁:T5

- [ ] **T5 会话行分支小字与强制删除二次确认**
      交付:worktree 会话在侧栏标题下多一行分支名;删有未提交改动的这类会话时,第一个确认框显示 git 原文,再给「强制删除」二次确认。
      挡谁:无

## 依赖

T1 → T2 → T3 → T4 → T5 串行。T3 与 T4 都只硬依赖 T2,但按阶段 4 的纪律串行执行;T5 的用例需要 T3 的拒绝信号与 T4 的入口才能跑绿,故 T5 排最后。

T1 是前置改动:它先把「会话 → 运行目录」这条来源建起来并把面板从「选中项目」解耦。之后 T2 只需往这条来源里填 worktree 路径,不必再回头改面板与终端。

## 遗留项

brief 第 6 节只有一件欠账:强制删除确认框与各处报错的具体措辞。落在 T5 定稿,最迟门 3 冒烟时定。定不下来时按 brief 第 2 节失败形态逐条核对文字,不影响任何行为。

- `panel-root` 用例 8 未覆盖「活动会话带 worktree 且所属项目已删」的最坏形态(T1 评审 Minor 3):实现走同一分支,风险低;门 3 终审再定是否补。
- 预览标签激活时,右栏面板仍跟随上一个终端会话的目录(T1 评审 Minor 4):spec 未表态,属既有标签语义的自然延伸,登记备查。

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
- **T1 会话运行目录与面板跟随** | 形态 L2(读数 10% 时派发 implementer) | commit `feat(T1): 会话运行目录收成单一来源并让面板跟随`(哈希待下一任务提交时回填,沿用 `df33a980` 的做法)
  - 落地:`SessionWorktree` + `Session.worktree?`(`shared/types.ts`);`resolveSessionDir`(`shared/session-dir.ts`);`resolvePanelRoot`(`renderer/src/panel-root.ts`);`App.tsx` 算 `panelRoot` 下传两个面板与「在 VS Code 打开」;两个面板删掉各自查选中项目的代码,重挂 key 从项目 id 改为根目录。
  - 验证:全量 50 文件 360 用例绿(BASE 352 + 新增 8);`pnpm typecheck` 双投影 0 error。
  - 评审:独立 reviewer,双裁决通过(规格 ✅ / 质量通过),0 Critical / 0 Important。
  - 处置:Minor 1(`App.tsx:54` 注释仍写 `${projectId}:${tick}`)已改;Minor 2(注释把「终端 cwd 已接入」写成现状)已改为「待 T2 接入」;Minor 3、4 记入遗留项。
  - 契约修订:步骤 12 的 Expected 由 `Tests 5 failed (5)` 改为 `Tests 4 failed | 1 passed (5)`——骨架恒返回 null 时用例 7(期望正是 null)结构上必绿;属 plan/契约级修订,未触及 brief。
  - 下一步用得上的结论:`resolveSessionDir` 的 `project` 必须是会话所属项目,不能猜;面板重挂 key 现在是根目录,T4/T5 加面板状态时不要假设 key 恒等于项目 id;spawn cwd 的唯一落点是 `sessions-slice.ts` 两处 `pendingSpawns.set`(T2 步骤 29)。

<!-- 四层文档的任何改动都在这里另行留一行 -->
<!-- 跨特性仍生效的判断登记到根目录 DECISIONS.md,不在这里留 -->
