# 侧栏项目树与 agent 弹窗 · 切片

> 2026-11-22 | 状态:已确认

## 任务

- [x] **T1 agent 选择弹窗基建**(commit 见开发记录)
      交付:Ctrl+N(有选中项目)打开「新建会话」弹窗,选 agent 建会话并开标签页;无选中项目时不动作;ui-slice 布尔量换弹窗描述状态,NewSessionMenu 删除
      挡谁:T2
- [ ] **T2 侧栏项目树重构**
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
- T1 agent 选择弹窗基建 | 完成 | commit 待回填
  - 基线:cc3ce86a
  - 评审:双裁决通过(规格符合 ✅ / 代码质量通过);Minor 2 条 -- ① ui-slice 头注释超前现状,已就地修(纯注释);② 导入结果消息与 ImportMenu 逐字重复,随 T2 删除 ImportMenu 自然消解,不抽公共函数
  - waiver:ui-slice.test.ts 的 makeStore 无返回类型注解,沿用基线 sessions-slice.test.ts 同款写法,非契约验证门
  - 变更登记:T1 契约「new 模式目标项目查不到 → 置灰+提示」为笔误,与 spec「渲染 null」互斥,controller 裁决以 spec 为准(implementer 停手上报,未写不可达分支)
  - 结论:
    1. AgentPickerPanel 以 mode:projectId 作 key:覆盖打开即全新弹窗(重拉清单、清消息),T2 接项目行入口无需处理覆盖残留
    2. 导入运行中按 Ctrl+N 会把弹窗切到 new 模式、导入后台继续完成(消息不再显示)——契约未规定,终审时可再定夺
    3. Esc 监听挂 window;弹窗遮罩拦截点击,焦点进不了终端,与 CLI 的 Esc 冲突场景不可达,冒烟顺带确认
