# TODO — 待办与待验证

> 唯一待办枢纽,只留未完成项(完成即删)。2026-11-25 起 `docs/pending-verification.md` 已并入本文件;「主题与样式设置」节已全部验证通过并移除(留痕见各 plan.md 与 git 历史)。

## 一、实机验证(本机可测)

### 会话名随回填自动更新(R1–R4;2026-11-24 跳过冒烟先行入库)

背景:该特性(新建会话初始名 = agent 显示名;回填拿到 agent 侧标题后写回会话名,手动改名不覆盖)代码完成、自测通过(typecheck 双投影 0 error、vitest 全绿、pnpm build 通过、eslint 改动文件 0 error),开发记录原计划「等用户冒烟确认」,经用户决定跳过冒烟直接提交。以下实机验证项后续处理,发现异常按 bug 修复流程处理。

- [ ] **R1. claude 会话名自动更新**
      验:新建 claude 会话(初始名「Claude Code」)→ 发一条消息 → 侧栏该会话名自动变为消息摘要(截断 96 字符)。
      边界:claude 项目首次会话需先过信任对话框;未信任时无 hook 无回填。
- [ ] **R2. pi 会话名自动更新(标题补捞)**
      验:新建 pi 会话(初始名「Pi」)→ 发一条消息 → 数秒内(节流档 750ms/2s/3s/15s)侧栏名自动变为消息摘要。
      为什么可能慢:补捞轮询沿用回填节流,首条消息若在补捞超时(2 分钟)后才发,则标题保持「Pi」属预期。
- [ ] **R3. 用户改名不被覆盖**
      验:新建会话后立即双击改名(如「我的会话」)→ 发消息 → 会话名保持「我的会话」不变。
      边界:把会话名改回与 agent 显示名完全相同(如「Pi」)会被回填标题覆盖,已知极罕见边界。
- [ ] **R4. 回填失败时保持初始名**
      验:同一 agent + 项目并发开第二个会话(无待回填资格)→ 重开原样拉起,会话名保持 agent 显示名,无异常。

### hook 状态通道实机冒烟(H1–H5)

hook 特性(`docs/plans/2026-11-23-hook-run-state/`)T5 收尾仅剩实机冒烟:代码已全量入库(0d8289fb,ADR-0007),以下过完即门 3。本机已装 claude 2.1.220 / pi 1.6.0。

- H1. claude 状态全环:提交提示 → spinner 转;回答完成 → 消失且后台弹「任务已完成」;权限对话框 → 橙(waiting)且弹「会话在等你输入」(首跑有项目信任框,未信任前无状态属 claude 侧行为)
- H2. pi 状态全环:提交 → spinner 转;/quit 回 shell → 消失;扩展对话框 → waiting(pi 首跑信任框,接受后扩展才加载,首个会话可能无状态,重开生效)
- H3. 双反例回归:working 中切标签再切回,动画全程正确;无回合时打字,spinner 不亮
- H4. 注入与用户配置共存:项目出现 `.claude/settings.json`(已有文件合并保留自有 hooks);删项目后 managed 条目摘除(pi 扩展文件删除)
- H5. 显式移除:控制台 `window.api.hooks.remove()` 后各项目配置摘净;重启应用 reconcile 又写回

## 二、条件验证(装好 agent 后)

### 装后复核(2026-11-25 自 pending-verification 并入)

- claude / codex:T6 导入(真实 jsonl/rollout 可读)与 T8 续接(`claude --resume <id>`、`codex resume <id>` 真机可用)
- kimi / antigravity:T7 导入路径与记录形状(`~/.kimi-code/sessions/.../state.json` + 索引配对键带 `session_` 前缀;antigravity `transcript_full` 是否总比 `transcript` 新);T10 分支名/状态规则
- H6(hook 通道):注入生效(codex 需 repo trust;antigravity hooks.json 形状;kimi 全局 config.toml marker)、事件映射正确、env 令牌继承(转发脚本 POST 带 sessionId)

## 三、新功能(未开工)

### hooks 显式移除的 UI 入口(2026-11-25 自待办底稿 C2 转入)

背景:hook 状态特性(ADR-0007)会把 hook 配置注入各项目(claude/codex/antigravity 项目级、kimi 全局 marker、pi 扩展),注入走认领制——应用只动自己写的条目,用户自有 hooks 保留。撤销能力在代码层已全通:`hooks:remove` 通道(shared 契约 + 主进程 handler)、preload 暴露 `window.api.hooks.remove()`,但渲染层零调用点,界面上没有入口,目前只能开 DevTools 控制台手敲触发(上节 H5 即此验法)。

要做:在设置对话框加「重置 hook 注入」类入口(形态待定:确认框、是否按项目列出),点击后移除应用注入、用户自有 hooks 保留;重启应用 reconcile 会重新写回。

来源:`docs/plans/2026-11-23-hook-run-state/` 遗留项(授权项)。

### 终端图片内嵌(kitty,功能缺口待移植;2026-11-25 自调研存档转入)

背景:2026-11-24 曾声明 `PI_IMAGE_PROTOCOL=kitty` 支持图片内嵌,实机恢复含图会话时 pi 向终端发 kitty 图形分块,addon 的 kitty 异步解码把 xterm 写管线卡死(冻结在图片位置、无法滚动),按用户决策**整体移除 addon**——依赖/挂载/选项接缝全清,当前行为 = 图片不渲染、文本流照常、无冻结(K2-1b 回归项)。

要做:先移植 Orca 的 kitty 全支持面(DA1 所有权协商、图片后强制重绘、kitty 文件读取——裸挂 addon 不够),再按存档指引重新接入。


存档与验项:`docs/terminal-image-rendering.md`(重加指引)、`docs/hook-state-test-guide.md` K2-1b。

## 四、优化与讨论(暂不排期)

### 优化待办(低危 polish;2026-11-25 自待办底稿 D1/D2 转入)

来源:`docs/plans/2026-11-22-sidebar-project-tree/` 终审挂账(M2–M6)。处置口径:个人项目、不使用键盘,键盘相关三条不做;M4 已冒烟确认;以下维持记录,碍事再做。

- M2 导入运行中 Ctrl+N/B 切走弹窗,「导入 N 条」结果消息不显示(数据无风险,导入照常入库)
- M3 「更多」菜单 role="menu" 键盘契约(Esc 关闭/方向键移动)未实现 —— 键盘不做,仅登记
- M4 底部项目「更多」面板滚动区裁剪风险 —— 2026-11-25 冒烟确认无裁剪,关闭
- M5 行本体 Space 未 preventDefault,聚焦行按 Space 滚动侧栏(特性前既有)—— 键盘不做,仅登记
- M6 弹窗无初始焦点管理,Tab 进终端后 Esc 会同时关弹窗并送 ^[ 给 CLI(窄路径低损)—— 键盘不做,仅登记
- D4 插件适配层守卫加固(2026-11-25 自待办底稿转入):反向依赖守卫不递归子目录/不识别 export-from;console.error 硬断言(测试脆);已知 agent 空 name 不回落;agents:list 启动失败后弹窗空列表直至重启(可加「重试」)—— 守卫加固类,碍事再做
- D9 piBucketName 仅按 Windows 路径形态编码会话桶名(`:` 与 `\` → `-`),非 Windows 上导入 pi 会话静默扫空(2026-11-25 自待办底稿转入) -- 跨平台支持范畴,Windows 首发不做;若出 Mac/Linux 版,需先实测 pi 在对应平台的桶名编码再补规则

### 待讨论(架构疑点):项目路径统一形态,反斜杠还是正斜杠

疑点(2026-11-25,D9 讨论中用户提出):全仓项目路径进来前都经 `path.normalize` 统一——**Windows 上它会转成反斜杠 `\`**,整个代码库的路径形态因此贴死 Windows(桶名推算、piBucketName、git/fs-tree 调用全在其上)。用户质疑:是否应该统一成正斜杠 `/`(Node 跨平台惯例,Windows API 同样接受)?

讨论要点:
1. 收益与风险面:统一 `/` 利于跨平台与代码可读;但触及面大(projects/sessions/import/git/fs-tree 全链路),非小改
2. 关键约束:pi 的会话桶名编码基于 **pi 进程 cwd 的原始形态**(Windows 上即反斜杠,T7 真机 9 桶穷举核对)——应用内部若改用 `/`,piBucketName 的编码输入与实测结论全部要重推,当前实现会静默扫空(D9 同源)
3. 交叉项:D9(桶名仅 Windows 形态)、`path.win32`/`path.posix` 分支的测试注入口径
4. 若讨论结论是「维持反斜杠」,应把理由写成显式约定(AGENTS.md 一条),防止后续贡献者再困惑

## 五、登记备查

### 已知边界(非待办;2026-11-25 自 pending-verification 并入)

- 切回内容很多的终端标签仍有约 1 秒等待(2026-11-25 T1 冒烟观察,长期观察项):NaN 毒化修复后从约 30 秒降至约 1 秒;预期由 T4 数据泵双闸(渐进追平)进一步改善,T4 落地后复测对比
- 未跟踪的新文件在 Git 面板点开没有 diff(显示「暂存后可见差异」):`git diff HEAD` 对未跟踪文件为空
- 草稿级 diff 着色:正文行首恰为 `---`/`+++`(如 YAML/SQL 注释)会丢增删底色,文本本身正确
- 回填轮询:并发第二会话若标签页一直开着不会自动接棒;关闭后重开走全新对话(防串线优先于自动续接,D8 结案口径)
- 空仓库(未提交过):Git 面板分支下拉为空、提交按钮禁用;取消暂存走 `git rm -f --cached`
- 应用未签名:安装包无代码签名,Windows SmartScreen 会提示「未知发布者」
- 可选验证(不阻塞):把 `settings.shell` 改回 `"cmd"` 验证 cmd 底座;GPU 上下文丢失场景(DevTools 注入 `WEBGL_lose_context`)终端应回退 DOM 绘制
