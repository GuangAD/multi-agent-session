# 主题与样式设置 · 切片

> 2026-11-24 | 状态:草稿

## 任务

- [ ] **T1 语义 token 层落地(不改行为)**
      交付:界面颜色全部收敛为语义 token(浅/深两套默认值 = 现状观感),滚动条 CSS 引用的变量获得真实定义;全应用观感与迁移前一致
      挡谁:T4
- [x] **T2 设置结构扩展与兼容**
      交付:设置新增界面主题双槽、终端主题双槽与终端外观六项;旧数据文件读入自动补默认值,fixture 回放绿
      挡谁:T3、T4、T5、T6、T7
- [ ] **T3 终端主题数据与外观解析**
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
- T2 守卫用例补充 | 评审 Minor(fontFamily 空串细则防误改)按接缝归属规矩补进 tasks/T2.md 用例表与 settings.test.ts | mutation check:改坏 fontFamily 校验(拒绝空串)后该用例恰转红(1 failed / 6 passed),还原后 7 passed 全绿 | 随下一条 fix 提交
