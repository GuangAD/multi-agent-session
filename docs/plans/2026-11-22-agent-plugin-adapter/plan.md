# agent 插件化适配层 · 切片

> 2026-11-22 | 状态:已确认

## 任务

- [x] **T1 主进程插件化迁移**
      交付:五个自包含插件包落成(定义/扫描器/fixture/随包 helper 同住);插件清单装载注册;runImport 改为扫描器注入(session-import 生产代码不再 import agents 域);scan-wiring 增加反向依赖守卫;全量测试绿(fixture 回放随迁全绿)
      挡谁:T2
- [x] **T2 渲染层载荷驱动**
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

- T1 主进程插件化迁移 | 完成 | commit 66aeee51
  - 基线:2c4b6af3
  - 评审:Important 1 条已处置(评审工件 .review/T1.patch 漏 env.d.ts——git add -N 范围笔误,已补齐重生成,非代码问题);Minor 4 条:①② 陈旧注释(shared/agents.ts icon 注释、kimi/plugin.ts 缺失语义)已就地修;③ 反向守卫不递归子目录/不识别 export-from 形式——留作后续加固;④ 未知 agentId 组合点由静默 0 条改 fail-loud——记录即可
  - waiver:无
  - 变更登记:两项契约裁决——①注册表不自注册 → 入口侧效 import 清单 + state-parser.test 一行清单接线(agent-state 仅测试文件最小改动);②icon 装载 fs 方案在 rolldown 单文件打包下失效(implementer 打包探针发现)→ 改 vite ?raw 构建期内联,plugin-icon.ts/.test 删除;另有 state-parser.ts 两行陈旧注释修正
  - 结论:
    1. 新增带图标插件 = 插件包目录(icon.svg + plugin.ts `import icon from './icon.svg?raw'`)+ 清单一行;?raw 构建期内联,打包/开发双形态可用(build 探针复核)
    2. 插件包回指扫描 SDK 为 3 级相对路径(plugins/<id>/ → session-import/)
    3. 未知 agentId 在 ipc/sessions 现为 fail-loud 抛错(原静默 0 条);scan-wiring 反向守卫暂不递归子目录,为已知加固点
- 开工前接口预检 | 通过
  - T1 → T2 | agents:list 载荷(def.icon?: string、def.color: string、剥函数)与 AgentBadge props({icon?, color?, name?, size?})| T2 契约消费形状与 T1 契约产出、spec 数据结构节三方一致;icon 可缺省语义统一(缺省 → 渲染层兜底砖)
  - 两任务共用既有接口 | bridge.agents.list()(渲染层装载)、agent-registry(register/getById/list)、runImport(签名反转后 ipc/sessions 注入 scan)| 均为既有调用点改造,名称与参数序对照源码一致
- T2 渲染层载荷驱动 | 完成 | commit d8c2d3c7
  - 基线:784098c0
  - 评审:Important 2 条已处置并过复审(①未知 agent 首字母缺失——SessionRow name 回落 agentId,补「中性色 + 首字母」约束;②启动链路失败耦合——App.tsx 改 Promise.all([loadProjects, loadAgents]) 并行,项目失败不阻断 agents 装载,复审均 ADDRESSED 无新增);Minor 1 条:agents-slice.test.ts 把「可接受」的 console.error 钉成硬断言——记录即可。范围外观察 2 条供终审:已知 agent def.name 空串不回落(载荷必填字段,非本次引入);agents:list 启动失败后弹窗空列表直至重启(用例 2 契约固化的设计,终审可权衡弹窗手动重拉)
  - waiver:无组件级渲染测试(项目测试范围为纯逻辑,brief 7.2 既有口径);两条 Important 修复为组件 JSX 传参与 effect 接线,无可落地守卫用例,防复发归 T3 冒烟清单
  - 变更登记:契约裁决——agentById 查无返回值,契约 prose(兜底描述对象)与伪代码/测试规格(undefined)不一致,按伪代码 + 用例 3 落地为 undefined(调用方全缺省传参,行为等价);兜底砖观感参数(color-mix 12% 低透明底、字号 size×0.5、中性 zinc 色)为契约未定值的实现选择,待手动冒烟确认
  - 结论:
    1. def.icon 是完整 SVG 文档字符串,data URL 化必须 encodeURIComponent(# 不转义会被 URL 解析截断);CSP img-src 已放行 data:(既有配置)
    2. 品牌 SVG 改经 <img> data URL 渲染后,SVG 内部 id 不再进主文档,同页多枚徽标无重复 id 冲突
    3. App.tsx 启动装载为 Promise.all([loadProjects, loadAgents]) → loadSessions:agents 与项目无关并行装载;loadAgents 自身失败不抛保持 [](sessions 仍随项目之后,顺序理由不变)
