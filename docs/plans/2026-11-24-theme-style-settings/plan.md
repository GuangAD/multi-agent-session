# 主题与样式设置 · 切片

> 2026-11-24 | 状态:草稿

## 任务

- [ ] **T1 语义 token 层落地(不改行为)**
      交付:界面颜色全部收敛为语义 token(浅/深两套默认值 = 现状观感),滚动条 CSS 引用的变量获得真实定义;全应用观感与迁移前一致
      挡谁:T4
- [x] **T2 设置结构扩展与兼容**
      交付:设置新增界面主题双槽、终端主题双槽与终端外观六项;旧数据文件读入自动补默认值,fixture 回放绿
      挡谁:T3、T4、T5、T6、T7
- [x] **T3 终端主题数据与外观解析**
      交付:Orca 22 套终端主题全量移植 + 字体族预置清单 + 终端外观解析纯函数(设置 → 终端配置与配色),用例绿
      挡谁:T5、T6、T7
- [ ] **T4 界面主题数据与选择应用**
      交付:8 套界面主题(各含深浅两形态)+ 主题选择解析 + 套用接线;手改数据文件重启界面即换色,三态切换正确换槽
      挡谁:T6、T7
- [ ] **T5 终端即时生效接线**
      交付:已开终端消费终端外观解析结果,设置变更即时 refit/重建并同步 PTY 网格;无右侧空白带回归
      挡谁:T6
- [ ] **T6 设置对话框**
      交付:MoreMenu 入口打开设置对话框,外观 + 通用两区全部控件可用,改动即时生效并即时落盘
      挡谁:T7
- [ ] **T7 终端样式预览块**
      交付:外观区顶部迷你终端预览,如实反映主题与字体改动,深/浅切换钮只切预览
      挡谁:无

## 依赖

T1 → T4;T2 → T3 → T5 → T6 → T7;T2 → T4;T4 → T6、T7;T3 → T6。实际执行按阶段 4 串行。

## 遗留项

brief 第 6 节无欠账,无遗留项。

## 开发记录

- 开工前接口预检 | 通过(BASE 前一次性完成)
  - 生产/消费对 | 生产方→消费方 | 名称、签名、形状与 spec 接口面清单一致:Settings 形状(T2)→T3/T4/T5/T6/T7;catalog/fonts/resolve(T3)→T5/T6/T7;app-themes/selectAppTheme/applyAppearance/settings-slice(T4)→T5/T6/T7;applyTerminalAppearanceToAll(T5)→App;PREVIEW_BUFFER(T7)
  - 文件落点交叉 | theme-tokens.css 由 T1 创建、T4 仅追加主题类;App.tsx 由 T1 迁移颜色类、T5 增订阅接线;ThemeToggle 由 T1 迁移类、T4 改造写手调用——均串行执行,无同任务冲突
  - 测试命令 | T1 无新测试模块(全量回归,基线实施者自记);T2 store-persistence.test.ts(既有)+ settings.test.ts(新建 6 条);T3 catalog.test.ts(1)+ resolve.test.ts(10),T4 追加后 Expected 16 passed 前后一致;T5 use-terminal.test.ts 既有 + 3;各 Expected 均含跑测条数,0 条不算通过已写明
  - 结论 | 无契约缺口,可直接开工;执行顺序:T2 先于 T1(理由见下方残局备注)
- 残局备注 | 工作区存在另一计划(2026-11-20-agent-sessions T11)的未提交改动 9 文件,与本计划 T1 的 App.tsx 迁移范围重叠;残局处置(续完/丢弃)待用户拍板,本计划先行 T2(与残局零交集,且为关键路径源头),T1 推后至残局落定
- T2 设置结构扩展与兼容 | 完成 | commit 见「feat(T2)」提交(基线 e5a6c4eb 之上,代码与本记账同 commit)
  - 基线:e5a6c4eb
  - 评审:独立 reviewer(子代理)裁决「规格符合、可进入提交」;Important 1 条已修(.review patch 补 untracked 测试文件);Minor 3 条已修(prettier 格式化两文件 + patch 重出);Minor 1 条转 T3(fontFamily 空串守卫用例,届时补进 T2 契约与 settings.test.ts,守卫用例须 mutation check);Minor 1 条记录在案(store-persistence.ts loadStore 的 typeof 放行数组为既有观察,非本次引入,不顺手改)
  - waiver:无
  - 变更登记:无(四层文档未动)
  - 结论:
    1. 测 main IPC 域(settings.ts 等)必须用字符串路径 vi.mock 且必须 mock ../app-window——app-window 的 icon.png?asset 资源导入在 Node 测试环境加载不到,import() 形式的 mock 还会触发类型强校验
    2. 实施方式:implementer 子代理 30 分钟超时,controller 会话内 fallback 续完;半成品(types/DEFAULT_STORE/loadStore 测试/settings.test 用例)经逐文件核对后采用,applyPatch 扩展由 controller 亲写(红 6 failed → 绿 6 passed)
- T2 守卫用例补充提交 | bf5a45a2 | 评审 Minor(fontFamily 空串细则防误改)按接缝归属规矩补进 tasks/T2.md 用例表与 settings.test.ts;mutation check:改坏校验(拒绝空串)后该用例恰转红(1 failed / 6 passed),还原后 7 passed 全绿
- T3 终端主题数据与外观解析 | 完成 | commit 见「feat(T3)」提交(基线 bf5a45a2 之上,代码与本记账同 commit)
  - 基线:bf5a45a2
  - 评审:独立 reviewer(子代理)裁决「规格符合、可提交、无必须修复项」;超额验证:22 套 × 22 键程序化 diff 与 .reference 源零偏差、回退链与 use-terminal 现状字节级一致、TerminalAppearance 9 字段与 xterm typings 逐一核对(T5 可直接展开);Minor 4 条:契约抄写源数字勘误已修(extended 实含 10 套取 6)、fontFamily 引号/空白防护与 fontWeight 直通无兜底为 T5 接线知悉项(经 UI 链路不可达,T2 已守门)、浅槽坏 id 用例为可选加固(记录,不扩范围)
  - waiver:无
  - 变更登记:tasks/T3.md 抄写源数字勘误一行(评审发现,本 commit 内)
  - 结论:
    1. TERMINAL_THEMES 只有契约 22 套,非 Orca 全量(Dracula/Nord 等 9 套名单外未收录)——T6 下拉直接消费键名,勿假设在册
    2. resolve.test.ts 用例体用动态导入,使整模块缺失的红是逐用例失败而非套件级;后续 themes 测试沿用该结构
    3. selectTerminalTheme 返回 { mode, theme };T5 若需 mode 从它取,TerminalAppearance 不含 mode
- T1 语义 token 层落地 | 完成 | commit 见「feat(T1)」提交(基线 121cd58f)
  - 基线:121cd58f(T11 残局清零之后)
  - 评审:self-review,非独立(纯样式任务按评审分级免派 reviewer,门 3 整特性终审兜底);16 文件 diff 全量审读,映射表整串精确替换
  - waiver:TDD waiver(契约预登记)——纯样式等价替换无逻辑分支;验证 = 残留扫描 0 处 + typecheck 0 error + 全量 278 passed
  - 变更登记:无(四层文档未动)
  - 归并决策(视觉近似收敛,精确观感待用户冒烟):①终端区浅底 zinc-50 归 base 白;②选中态与悬停共用 bg-hover(深 700/800 归 800);③输入框边框 zinc-300/600 归 line;④FilePreview 代码底 zinc-100 归 surface;⑤次文本 500/400 归并 inkMuted 600/300(对比度略升);⑥Tab 关闭钮 hover 300/700、600/200 归 hover/ink
  - 结论:
    1. 语义 utility 共 9 个,T4 主题类只需覆盖 --app-* 变量即可整体换色
    2. scrollbar-sleek 兼容别名 --foreground/--muted-foreground 已接真值(此前一直走兜底)
    3. 视觉冒烟本机不可达(无视觉),R5 已追加 TODO.md 待用户
- T4 契约缺口处置 | implementer 发现 applyDarkClass 第二调用点(main.tsx 首帧防闪,T11 评审 Minor-6 引入,契约未列) | 批准两行连带改动(import + 调用改 applyAppearance(…,'default'),行为等价);已补进 tasks/T4.md「补充落点」节 | 随 T4 提交
- T4 界面主题数据与选择应用 | 完成 | commit 见「feat(T4)」提交(基线 7a34d5eb 之上,代码与本记账同 commit)
  - 基线:7a34d5eb
  - 评审:独立 reviewer(子代理)裁决「规格符合、可提交」;色值三处逐格核对零偏差(契约表 ↔ 目录 ↔ CSS);resolveMode 抽取逐字等价;applyAppearance 唯一写手全域 grep 证实;main.tsx 两行严格在批准范围。Important-1(循环 import 的 TDZ 顺序偶然,测试测不出的启动白屏地雷)已随本提交加固:createSettingsSlice 改 hoisted function 声明 + 注释改为结构保证论证;该缺陷无法用测试钉住(求值顺序问题),以结构加固 + 评审复核关闭,不做 mutation check(无新守卫用例可钉)
  - waiver:无
  - 变更登记:tasks/T4.md「补充落点」节(main.tsx 契约缺口,commit 7a34d5eb);tasks/T6.md「实施期补充」节(Minor-4 外观重放归消费方 + Minor-2 默认值提升建议)
  - Minor 遗留:②默认值三处手工镜像(T6 可选加固);③CSS↔目录色值一致性无锚定测试(后续加固,144 值核对脚本一次性);④浅槽坏 id 用例可选加固——均记录在案,门 3 汇总
  - 结论:
    1. selectAppTheme 返回整套 AppTheme(含深浅两形态),T6/T7 按 mode 取形态
    2. applyAppearance 对目录外 id 兜底为不挂主题类 = 默认观感,调用方传 id 前无需校验
    3. T6 必须显式重放外观(tasks/T6.md 实施期补充第 1 条),勿假设 updateSettings 自动生效
