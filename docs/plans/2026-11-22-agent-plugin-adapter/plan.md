# agent 插件化适配层 · 切片

> 2026-11-22 | 状态:已确认

## 任务

- [ ] **T1 主进程插件化迁移**
      交付:五个自包含插件包落成(定义/扫描器/fixture/随包 helper 同住);插件清单装载注册;runImport 改为扫描器注入(session-import 生产代码不再 import agents 域);scan-wiring 增加反向依赖守卫;全量测试绿(fixture 回放随迁全绿)
      挡谁:T2
- [ ] **T2 渲染层载荷驱动**
      交付:agents 载荷 store(启动装载一次);徽标按载荷渲染(icon=SVG 字符串经 data URL,未知 agent 兜底);AgentPickerDialog 与 SessionRow 接 store;删除 agents-icons 硬编码映射与 AGENT_COLORS 表
      挡谁:T3
- [ ] **T3 验收用假 agent 冒烟**
      交付:临时假 agent 插件 + 清单一行 → `pnpm dev ` 手动过五环(列表出现/安装探测/状态点/新建会话/导入与续接降级路径)→ 移除登记与目录恢复原状;冒烟证据记入开发记录
      挡谁:无(前置:T1、T2)

## 依赖

T2 依赖 T1(载荷的 icon/color 字段与依赖反转先存在,渲染层才有东西可消费);T3 依赖 T1+T2(冒烟验证完整链路)。T1 无前置。实际执行按阶段 4 串行。

## 遗留项

- AGENTS.md「领域横向依赖双向例外」条目的删除在收尾执行(brief 第 4 节约束:迁移完成后例外应具备删除条件)。

## 开发记录

- 开工前接口预检 | 通过
  - T1 → T2 | agents:list 载荷(def.icon?: string、def.color: string、剥函数)与 AgentBadge props({icon?, color?, name?, size?})| T2 契约消费形状与 T1 契约产出、spec 数据结构节三方一致;icon 可缺省语义统一(缺省 → 渲染层兜底砖)
  - 两任务共用既有接口 | bridge.agents.list()(渲染层装载)、agent-registry(register/getById/list)、runImport(签名反转后 ipc/sessions 注入 scan)| 均为既有调用点改造,名称与参数序对照源码一致
