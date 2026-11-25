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
- [x] **T6 设置对话框**
      交付:MoreMenu 入口打开设置对话框,外观 + 通用两区全部控件可用,改动即时生效并即时落盘
      挡谁:T7
- [x] **T7 终端样式预览块**
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
- T5 终端即时生效接线 | 完成 | commit 见「feat(T5)」提交(基线 1ecc9989)
  - 基线:1ecc9989
  - 评审:self-review,非独立(子代理额度耗尽,无法派 reviewer;按 code-review fallback 做冷却自审 + mutation check,门 3 整特性终审兜底)
  - 实施方式:implementer 子代理中途失败(供应商 429 额度上限,非代码问题)且 heredoc 损坏一行(console.error 的模板字面量被 bash 展开吃掉,已修复),controller 会话内续完并自补用例 2/3
  - mutation check(补足用例 2/3 未亲历红的鉴别力):①创建期 fontSize 改死 14 → 用例 2 精确转红(1 failed/27 passed);②运行时 theme 固定深槽 → 用例 3 精确转红(1 failed/27 passed);均还原后 28 passed 全绿
  - 契约更正(记账,需在 spec/契约侧理解口径):xterm 6.1.0-beta.336 无 applyOptions 方法(已核 typings),运行时全量更新唯一入口是 `terminal.options = {...}` setter(逐键部分合并、对象值按引用比较);契约「applyOptions」措辞按此执行,行为等价
  - 契约更正 2:openTerminal 签名定为 (sessionId, scrollback, settings, systemDark, container);TerminalView 挂载时命令式读 store(useAppStore.getState().settings)而非订阅,理由:设置变化由 App 层统一 apply,不应触发实例重建
  - waiver:无
  - 变更登记:tasks/T5.md 未改(措辞更正记在本行);use-terminal.test.ts 既有字体度量用例的字重断言由 '300'/'500' 字符串改为 300/500 数值(T3 评审已确认语义等价)
  - Minor 遗留:TerminalTabs 仍自持 scrollback 的 bridge.settings.get() 读取(T6 可改为读 slice,消除第二处设置读取路径)
  - 结论:
    1. 运行时外观更新用 terminal.options setter;隐藏终端(display:none)跳过 fit,由 activateTerminal 既有 RAF 补齐,切勿在隐藏态 fit(会压成 2×1 最小网格)
    2. 度量变更的 PTY 同步无需额外接线:fit 改 cols/rows 后既有 onResize → pty.resize 自动生效
    3. T6/T7 若要预览实例,不要加入 use-terminal 的 terminals 注册表(否则 applyToAll 会误改预览)
- T1 缺陷修复(Critical,自审发现) | fix(T1) 提交 | 症状:pnpm build 产物 CSS 仅 8.7KB,terminal.css / scrollbar-sleek.css / theme-tokens.css 全部未进产物(xterm-container=0、data-scrollbars=0、--app-base 缺失),即 T1 起语义色变量运行时全部未定义、界面色回退透明/默认;根因:T1 改 main.css 时删掉了文件头注释的闭合 `*/`,导致后续 `@import 'tailwindcss'` 与 @custom-variant 被吞进注释,且三个 CSS @import 排在规则之后按 CSS 规范被丢弃;修复:重写 main.css 为规范顺序(注释闭合 + @import 'tailwindcss' 与三个本地 CSS 全部前置,@custom-variant/@theme 在后),产物 36KB,xterm-container×3 / data-scrollbars×13 / theme-warm×2 / --app-base 均已在;教训:纯样式任务标 waiver 后只跑 typecheck 与单测无法发现 CSS 未进产物,渲染层/样式改动必须验 `pnpm build` 产物内容(T1 契约第 10 步只写了冒烟,未写产物校验)
- T6 设置对话框 + T7 终端样式预览块 | 完成 | commit 见「feat(T6/T7)」提交(基线 d7348d22)
  - 基线:d7348d22
  - 评审:self-review,非独立(子代理额度耗尽至 18:44,无法派 reviewer;门 3 终审兜底)
  - 实施方式:controller 会话内实现(T6/T7 相邻且共用 AppearanceSection,合并一轮交付;两者仍是独立可演示的交付物:对话框壳+控件 vs 预览块)
  - waiver:TDD waiver(契约预登记,两任务均属 UI 接线/展示)——验证 = typecheck 0 error + 全量 292 passed + `pnpm build` 通过且产物含全部主题类(T6 期间发现的 T1 缺陷即由该检查暴露)+ `pnpm dev` 启动 25s 无渲染层模块错误
  - 自审发现并就地修复 3 处:
    1. **功能缺口(重要)**:TerminalTabs 只在挂载时读一次 scrollback → 对话框改行数不会重建终端,验收条目 7 无法达成;改为订阅 settings 切片(变化即触发 TerminalView 既有重建 effect),并清掉随之产生的孤儿导入/常量
    2. 预览字号截断为 ≤14 会违背「如实反映」验收;改为直通设置值,靠容器滚动容纳
    3. App 启动把 loadSettings 塞进 Promise.all 会因设置读取失败连坐跳过 loadSessions;改为独立 catch 兜底
  - 变更登记:tasks/T6.md「实施期补充」第 1 条(外观重放)已按 T4 评审要求在 patchAppearance 中落实;第 2 条(默认值提升到 shared)未做——保留为 Minor(T6 未扩范围)
  - Minor 遗留:①settings-slice INITIAL_SETTINGS 仍为主进程 DEFAULT_STORE 的手工镜像(建议后续提升到 shared);②CSS↔目录色值一致性无锚定测试;③浅槽坏 id 用例未补
  - 结论:
    1. 界面主题改动必须由消费方显式调 applyAppearance(patchAppearance 内已做),store 变更不会自动重绘
    2. 深浅归属显式化(自审第 4 处修复):初版浅槽下拉只有 1 项,与 brief「双槽各可选」不符;catalog.ts 增 DARK/LIGHT_TERMINAL_THEME_NAMES 两张显式名字表(不按名字猜:Catppuccin Latte / Rose Pine Dawn 不带 Light 后缀),catalog.test.ts 增划分断言钉住「两表恰好划分目录、无重名、首位为默认」,下拉改为消费这两张表
    3. 预览实例用独立 Terminal,不进 use-terminal 注册表,故 applyToAll 不会误改预览
- 整特性收尾补测(自查第 3/4 条) | applyAppearance 在 spec 接口面清单标为「接缝」却无用例(自查发现的缺口) | 处置:theme.ts 的 applyAppearance 增加可注入 root 参数(默认 document.documentElement,不新增依赖、不引 jsdom),新增 theme.test.ts 6 条用例覆盖:dark+非默认主题、default 不挂类、切换清旧类幂等、目录外 id 兜底、全部目录 id 对齐、三态解析衔接;mutation check:去掉 default 判断后「default 不挂主题类」与「目录内每个 id」两条精确转红(2 failed / 4 passed),还原后 6 passed | 全量 43 文件 299 passed
- 挂起 Minor ② 关闭(整特性收尾) | 新增 app-themes-css.test.ts 2 条:直接读 theme-tokens.css,解析 :root/.dark 与 14 个 .theme-<id> 块,与 APP_THEMES 逐值比对(9 token × 16 形态) | mutation check:把 warm 浅形态 accent 末位由 9 改 a 后「其余每套主题」用例精确转红(1 failed/1 passed),还原后 2 passed | 全量 44 文件 301 passed
- 整特性终审(门 3 前) | 独立 reviewer 裁决 **BLOCK**(2 项 P1),其余 P2/挂起 Minor 可后置;已全部按裁决处置
  - 终审发现的接缝缺口:S8「隐藏终端跳过 fit」分支零测试(正是 P1-2 的藏身处)、S10 外观重放无测试(设计如此,依赖冒烟)、S2 INITIAL_SETTINGS 无锚定(评审手工比对当前同值)
  - **P1-1 已修**:数字输入逐键直连 patch → 主进程夹紧回写,字号无法键入 16(键「1」即被夹成 8),回滚行数逐键重建全部终端且中间值落盘。处置:新增 NumberField 组件(本地草稿态,失焦/回车提交,方向键即时提交,空串/非数字/越界本地不提交),字号/行高/回滚行数三处改用
  - **P1-2 已修**:openTerminal 首帧 fit 无隐藏守卫 → 0 尺寸盒经 StableCellFitAddon 提案成 2×1 并被 fit 当真,经 onResize → pty.resize(2,1) 打到后台 agent(T6 订阅让该路径可达)。处置:首帧 RAF 加 `display === 'none'` 守卫并跳过 ready;新增 readyFired 标记,首次可见的 activateTerminal 补发一次 ready(否则隐藏期创建��会话永不 spawn);同时纠正文件头那句与自定义 addon 矛盾的断言。补 S8 用例(隐藏不 fit、外观应用不 fit、可见照旧 fit):**mutation check 去掉守卫 → 该用例精确转红(1 failed / 28 passed)**
  - P2-1(TDZ 残留面)未修,记录:hoisted function 只保证可调用,INITIAL_SETTINGS 仍是 const;结构解法与 Minor① 同一刀(默认值提到 shared),建议门 3 后单独立项
  - P2-2 已修:预览初态改 `resolveDark(settings.theme, systemPrefersDark())`(此前 system+系统浅色时预览显示深色,两副面孔)
  - P2-3 已修:预览创建失败时渲染占位文案,不再留空白边框
  - P2-4 已修:TerminalTabs 头注释与订阅行为对齐;预览切换钮 aria-label 随当前态变化;预览示例提示符产品名 Orca → soloport(文件头登记该偏离)
  - Minor③ 已修:补浅槽坏 id 用例(浅槽兜底走另一常量,深槽用例测不到);**mutation check:浅色态改用深默认 → 用例 5b 精确转红(1 failed / 16 passed)**
  - 最终验证:typecheck 0 error;`pnpm test` 44 文件 303 passed;`pnpm build` 产物 CSS 35.97KB,--app-base×17 / data-scrollbars×13 / theme-warm×2 / xterm-container×3(与终审给出的期望值逐项吻合)
- 门 3 冒烟反馈修复 | 用户实测「没有看到打开设置的按钮」 | 原因:门 1 接受 Q3 建议把入口放在项目行「更多」菜单,而 MoreMenu 是**项目级**菜单——零项目时该菜单不存在,有项目时也要先想到点「…」,应用级设置因此不可发现。处置:标题栏在主题按钮右侧加齿轮按钮(aria-label「设置」),不依赖任何项目;项目行菜单里的同名项保留。属对 brief 第 5 节入口形态的补充,不是推翻(方向仍是「对话框 + 即改即存」),门 3 报告已明示
- 门 3 冒烟反馈修复 2 | 用户截图:「下拉框样式不对」 | 现象:select 关闭态正常,展开的原生弹层是白底浅灰字(文字几乎不可读);根因:原生弹层由浏览器绘制,不吃 Tailwind 类,只认 color-scheme 与 option 自身样式,而我们此前只用 JS 在 html 上内联 colorScheme。处置:theme-tokens.css 增 :root/.dark 的 CSS 级 color-scheme(首帧即正确)+ 表单控件 color-scheme: inherit + option 背景/文字取语义 token;顺带把主题/字体下拉宽度给到 w-60(此前「默认灰」被截成「默认」)
- 门 3 冒烟反馈修复 3 | 用户要求:设置里要能切深浅,不必关弹窗再点标题栏 | 处置:外观区顶部新增「主题模式」三段控件(跟随系统/浅色/深色),走与标题栏按钮同一条路径(patchAppearance → updateSettings + applyAppearance),按钮态由 slice 同步(标题栏 ThemeToggle 读同一份 settings.theme);终端侧由 App 层订阅 settings 自动跟随 | 属对 brief 第 2 节「设置对话框含外观分区」的补充实现,未改变既有决策
- 门 3 冒烟反馈修复 4 | 用户截图:换界面主题后**左栏与右栏不变色**,右上角(窗口按钮区)也不变 | 两处独立根因:①两个 `<aside>` 不写背景色,显示的是页面 canvas 默认色——只随 color-scheme 的明暗二值变,不跟 8 套主题色走;处置:根容器(`h-screen` div)加 `bg-base`,侧栏自然继承。②右上角是 Electron `titleBarOverlay`(系统绘制,不随页面 CSS),此前只按 `nativeTheme.shouldUseDarkColors` 算中性色;处置:主进程新增 `titleBarOverlayColorsForSettings`,用 shared/themes 的 selectAppTheme 解析当前主题取 base/ink 着色,并在启动时同步一次(此前只在设置变更与系统深浅变化时同步)
- 门 3 冒烟反馈修复 5 | 用户要求侧栏与内容区分层(VS Code 式) | 现状 token 不够用:浅色主题下 base 与 surface 都是纯白,拿 surface 当侧栏底看不出差别。处置:新增专用语义 token `panel`(侧栏/面板容器底),8 套 × 深浅共 16 个值与 base 做微妙偏移(浅色略暗、深色略亮);改面:AppTokenValues 类型、APP_THEMES 数据、theme-tokens.css 16 块变量、main.css `--color-panel` 映射、App.tsx 两个 aside 改 `bg-panel`、app-themes-css.test 的 token 数与映射表(9 → 10)。验证:typecheck 0;44 文件 303 passed;build 产物含 bg-panel 与 17 处 --app-panel
- 主题候选调研(用户:现有 8 套都不满意,要深/浅各 20 套预览) | 产出 theme-previews.html + 生成脚本 theme-preview-gen.py(同目录,可复现) | 色值来源:①仓库内 catalog.ts 已移植的 22 套(一手);②外部官方色值文件:Catppuccin(nvim palettes: mocha/macchiato/frappe)、Rosé Pine(palette.lua: main/moon/dawn)、Tokyo Night(storm.lua/moon.lua)、Kanagawa(colors.lua: wave/dragon/lotus)、Nord、Dracula、Selenized(the-values.md: dark/black/light/white)、Nightfox(dayfox/dawnfox)、Ayu Light、PaperColor Light、Gruvbox(colors 的 dark0_hard/soft、light0_hard/soft)、Everforest(palette.md 的 hard/medium/soft × 深浅) | UI 中间色为派生:panel/surface/line/hover = base 向 ink 混合固定档位,onAccent 取对比度更高的黑/白,页面上写明 | 对比度体检:正文对比度多 6.5–14,Solarized 两套本身即低对比(GitHub 上可查到设计意图),已在页面标注
- 主题候选补充(用户:vscode 的主题配置包含吗 → 加一下) | 预览页增加第三段 9 套:VS Code Dark Modern / Dark+ / Light Modern / Light+ 与 GitHub Dark / Dark Dimmed / Dark High Contrast / Light / Light High Contrast,数据取自 .reference 里 Orca 打包的规范化 JSON(字段与 token 一一对应:base←--background、panel←--sidebar、surface←--card、line←--border、ink←--foreground、inkMuted←--muted-foreground、accent←--primary、onAccent←--primary-foreground、hover←--secondary) | 诚实标注:7 套「官方 9 值 + 仅 accentHover 派生」;**Dark+/Light+ 的 JSON 只有 background/border/foreground 三项**,其余 7 项派生,卡片底部逐项列出,页面明说其观感不等同真正 Dark+/Light+ | 对比度体检:9 套 ink/base 均 ≥7.6,onAccent/accent 均 ≥4.5
- 主题候选扩充(用户:再来一些) | 预览页增至 65 张:深 32 / 浅 24 / 官方 9 | 新增深色 12 套:Cobalt2、Ayu Mirage、Carbonfox、Selenized Dark/Black、Flexoki Dark(外部)+ Night Owl、Horizon Dark、Material Dark、Ayu Dark、Tango Dark、Ghostty Default Dark(仓库内 catalog 未用到的) | 新增浅色 4 套:Alabaster、Ashes Light、Tomorrow、Flexoki Light | 新增色值来源:alacritty-theme(Cobalt2 / ayu_mirage / carbonfox / alabaster / ashes_light / tomorrow 的 toml,srgb 官方值)、kepano/flexoki README 的 base 与 400/600 强调色 | 标题与分区改为动态计数,避免再写死
- 主题定选(用户给出 10 套清单 + 两处主色覆盖) | 产出 theme-selection-preview.html(5 深 + 5 浅单独预览)与 theme-selection-tokens.json(10 套 token 值,供落地时直接抄) | 选:深 = VS Code Dark Modern、GitHub Dark(主色指定 #0078d4)、GitHub Dark High Contrast、Carbonfox、Tango Dark;浅 = VS Code Light+、GitHub Light(主色指定 #000000)、Gruvbox Light (hard)、Selenized White、Tango Light | 对比度:正文 10.26–21,按钮文字 4.49–21 | 待用户决定的模型问题:APP_THEMES 每套主题自带深浅两形态,而清单是 5 纯深 + 5 纯浅,落地前需确定配对

## 第二版改造(2026-11-24 用户定选 12 套 + 单槽直选,回退协议重过门 1 后)

决策依据:ADR-0009(取代 ADR-0008 的槽结构部分)、台账 J-005、brief 第二版第 2/5/7 节。
第一版已完成的 T1(语义 token 层)与 T3(22 套终端主题 + 解析)保留,T2/T4/T5/T6/T7 按下列任务改造。

- [ ] **T-R1 数据结构与迁移** —— Settings 换 appTheme/terminalTheme 单槽,DEFAULT_STORE 与 settings-slice 初值同步,applyPatch 校验改单槽,loadStore 做旧字段迁移(旧三态/双槽 → 新字段,旧主题 id 落默认);测试:迁移 4 例 + 校验 4 例 —— 挡 T-R2 之后全部
- [ ] **T-R2 界面主题数据 12 套** —— app-themes.ts 改单 token + isDark(值取 theme-selection-tokens.json),theme-tokens.css 出 12 个 .theme-<id> 块,:root 留兜底;app-themes.test 与 app-themes-css.test 改口径(12 套 × 10 token) —— 挡 T-R3
- [ ] **T-R3 解析与唯一写手** —— resolve.ts:selectAppTheme→getAppTheme(settings)、selectTerminalTheme→getTerminalTheme(settings)、resolveTerminalAppearance 去掉 systemDark;theme.ts:applyAppearance(theme) 按 isDark 写 .dark 与 color-scheme;删 resolveDark/systemPrefersDark;测试改为新签名 —— 挡 T-R4/T-R5
- [ ] **T-R4 设置对话框** —— 删「主题模式」三段;界面主题单下拉(12,按深浅分组显示)、终端主题单下拉(22,按 DARK/LIGHT 名表分组);预览删深浅钮;patchAppearance 走 getAppTheme —— 挡无
- [ ] **T-R5 终端接线** —— openTerminal(sessionId, scrollback, settings, container)、applyTerminalAppearanceToAll(settings)、TerminalView 只读 store、App 去掉 matchMedia 与 systemDark —— 挡无
- [ ] **T-R6 main 进程** —— settings.ts 校验去三态;nativeTheme.themeSource 与标题栏 overlay 颜色按所选主题 isDark/token 计算(不再读系统深浅) —— 挡无
- [ ] **T-R7 标题栏清理** —— 删 ThemeToggle 组件与 App 里的使用(保留齿轮设置入口) —— 挡无
- [ ] **T-R8 收尾** —— typecheck + 全量 test + build 产物校验(CSS 含 12 个 theme 类)+ 冒烟清单更新(TODO.md) —— 挡门 3
- 第二版准备 | 新增 gen-theme-data.py:从 theme-selection-tokens.json 生成 app-themes.ts(12 套 × 单 token + isDark + DEFAULT_APP_THEME_ID)与 theme-tokens.css 的 12 个 .theme-<id> 块(标记后整段重写,避免手抄 120 个色值);**尚未执行**——执行会改变数据结构,必须与 T-R3(解析/写手)同一片做,否则编译不过 | 当前代码仍为第一版(三态 + 双槽),构建与测试全绿,无半成品状态
