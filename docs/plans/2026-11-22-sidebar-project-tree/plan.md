# 侧栏项目树与 agent 弹窗 · 切片

> 2026-11-22 | 状态:已确认

## 任务

- [x] **T1 agent 选择弹窗基建**(commit 见开发记录)
      交付:Ctrl+N(有选中项目)打开「新建会话」弹窗,选 agent 建会话并开标签页;无选中项目时不动作;ui-slice 布尔量换弹窗描述状态,NewSessionMenu 删除
      挡谁:T2
- [x] **T2 侧栏项目树重构**(commit 见开发记录)
      交付:「项目」标题行 + 右侧「+」添加项目;项目行展开/折叠 + 选中、常驻「+」「…」;「更多」菜单(导入历史会话 / 移除项目)接弹窗;ImportMenu 删除
      挡谁:无

## 依赖

T2 依赖 T1(弹窗组件与 ui-slice 弹窗描述状态先存在,T2 的入口才有东西可调);T1 无前置依赖。实际执行按阶段 4 串行。

## 遗留项

无 —— brief 第 6 节无欠账。

## 开发记录

- 开工前接口预检 | 通过
  - T1 → T2 | ui-slice 弹窗描述状态(openAgentDialog / closeAgentDialog / agentDialog)| T1 契约接口节与 T2 契约调用形状逐字一致(mode/projectId 字段名、整体覆盖语义);文件落点 ui-slice.ts 归 store、AgentPickerDialog.tsx 归 components/sidebar,T2 只消费不改动
  - 两任务共用既有接口 | sessions-slice.openSession(project, agent) / importSessions(projectId, agentId) / projects-slice.addProject/removeProject/selectProject | 已对照 app-store 装配与切片源码,名称、参数序与实况一致
- T1 agent 选择弹窗基建 | 完成 | commit b2aacb32
  - 基线:cc3ce86a
  - 评审:双裁决通过(规格符合 ✅ / 代码质量通过);Minor 2 条 -- ① ui-slice 头注释超前现状,已就地修(纯注释);② 导入结果消息与 ImportMenu 逐字重复,随 T2 删除 ImportMenu 自然消解,不抽公共函数
  - waiver:ui-slice.test.ts 的 makeStore 无返回类型注解,沿用基线 sessions-slice.test.ts 同款写法,非契约验证门
  - 变更登记:T1 契约「new 模式目标项目查不到 → 置灰+提示」为笔误,与 spec「渲染 null」互斥,controller 裁决以 spec 为准(implementer 停手上报,未写不可达分支)
  - 结论:
    1. AgentPickerPanel 以 mode:projectId 作 key:覆盖打开即全新弹窗(重拉清单、清消息),T2 接项目行入口无需处理覆盖残留
    2. 导入运行中按 Ctrl+N 会把弹窗切到 new 模式、导入后台继续完成(消息不再显示)——契约未规定,终审时可再定夺
    3. Esc 监听挂 window;弹窗遮罩拦截点击,焦点进不了终端,与 CLI 的 Esc 冲突场景不可达,冒烟顺带确认
- T2 侧栏项目树重构 | 完成 | commit fc17f042
  - 基线:b2aacb32
  - 评审:Important 1 条已修(行级 keydown 未隔离嵌套按钮键盘激活 → 行 onKeyDown 加 target 守卫,复审 ADDRESSED)+ Minor 1 条顺手修(菜单面板空白点击冒泡 → 面板 stopPropagation);Minor 2 条记录在案:① role="menu" 键盘契约(Esc/方向键)未实现,后续需要时补;② 底部项目菜单「更多」面板有滚动区裁剪风险,冒烟确认
  - waiver:同契约预登记(UI 装配不加单测);键盘守卫的自动 mutation check 不可达(组件键盘行为无测试接缝),以手动冒烟替代并标注未自动化
  - 变更登记:controller 修 AgentPickerDialog.tsx 一处陈旧注释(指向已删 ImportMenu,纯注释);无四层文档改动
  - 结论:
    1. 项目行内再加动作按钮必须同时阻断 click 与 keydown 冒泡,否则连带「选中 + 展开切换」
    2. 层级约定:MoreMenu 遮罩 z-40、面板 z-50,AgentPickerDialog 遮罩 z-50;菜单与弹窗不会同时存在
    3. 范围外观察(留终审):行本体 Space 未 preventDefault,聚焦行按 Space 可能引发侧栏滚动,系 T2 之前既有行为
  - 冒烟清单(门 3 前 controller 执行,未自动化):brief 7.1 六条 + 焦点在「+」「…」按 Enter/Space 不触发行切换 + 面板空白点击不改选中 + 底部项目「更多」面板不被裁剪
- 终审(整特性 cc3ce86a..fc17f042)| 完成 | 裁决:可合并
  - 评审:无 Critical / 无 Important;三条接缝(生产/消费一致、两删除零残留、双入口行为一致)逐条核验通过;挂账 Minor M1-M6 逐条核验均可留
  - controller 就地修复:projects-slice.ts 两条孤儿注释(引用已删 NewSessionMenu → 现状描述),复审确认与现状一致;终审后门禁 pnpm typecheck exit 0 + pnpm test 29 files / 195 tests 全绿
  - 遗留结案(2026-11-25):M4 冒烟确认无裁剪;M3/M5/M6 为键盘交互,个人项目不使用键盘不处理;M2 与键盘三条转入 TODO.md「优化待办」节统一接管(底稿 docs/backlog-2026-11-25.md 的 D1/D2 同步移除)
  - 沉淀对账:本特性无新 CONTEXT.md 词条、无新 ADR(纯 UI 重排,可逆;无新领域术语),与文件实况相符
