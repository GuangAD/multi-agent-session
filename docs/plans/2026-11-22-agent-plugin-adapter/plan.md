# agent 插件化适配层 · 切片

> 2026-11-22 | 状态:已确认

## 任务

- [x] **T1 主进程插件化迁移**
      交付:五个自包含插件包落成(定义/扫描器/fixture/随包 helper 同住);插件清单装载注册;runImport 改为扫描器注入(session-import 生产代码不再 import agents 域);scan-wiring 增加反向依赖守卫;全量测试绿(fixture 回放随迁全绿)
      挡谁:T2
- [x] **T2 渲染层载荷驱动**
      交付:agents 载荷 store(启动装载一次);徽标按载荷渲染(icon=SVG 字符串经 data URL,未知 agent 兜底);AgentPickerDialog 与 SessionRow 接 store;删除 agents-icons 硬编码映射与 AGENT_COLORS 表
      挡谁:T3
- [x] **T3 验收用假 agent 冒烟**
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
- T3 验收用假 agent 冒烟 | 完成 | 无提交(临时脚手架已撤,工作区恢复干净)
  - 基线:f1d33d89;临时件:plugins/demo-smoke/plugin.ts + plugins/index.ts 登记行(冒烟后整包移除,未入库)
  - 五环冒烟结果(用户 2026-11-22 本机 pnpm dev 实测,逐条):①列表+缺失兜底——通过,「冒烟用例」以紫底紫字「冒」兜底砖显示(无 icon.svg),安装态已安装(cmd 命中);②安装探测——通过(同①);③状态点——通过,echo 输出变绿 working、静置 2 秒变灰 idle;④新建会话——通过,demo 会话可建、标签打开、cmd 可交互;⑤导入+续接降级——通过,导入扫出 1 条假候选入库、重开以 null resumeArgv 原样拉起 cmd;二次去重经用户纠正入口后通过(弹窗提示「跳过 1 条」,库内仍 1 条)
  - 冒烟期三条疑似问题澄清(均非产品缺陷,Controller 已向用户说明,用户确认):①兜底砖「字是紫色」——设计即 12% 透明底+实色字母,是 Controller 此前把字色描述成白色有误;②`exit` 未变红——ADR-0004 常驻 shell,exit 只退内层 demo 进程、外层 PTY 仍在,红点只在标签页/PTY 终结时出现,是 Controller 给的验证方法本身不对;③「可重复导入」——用户点错入口(点「+」走了新建会话,症状=弹窗关闭+多一条记录),按「…→导入历史会话」重测确认去重正常(runImport 复现脚本:首次 imported=1/二次 imported=0 skipped=1;既有用例 4 同证)
  - waiver:无单测接缝(契约预登记:端到端人工验收,GUI 链路无自动化接缝);本任务无代码入库,评审降级——脚手架 diff 直读 + 四项静态核查(path-match 正斜杠归一/runImport 不读 filePath/state-parser 消费 degraded/ipc/pty 消费 null resumeArgv)通过;独立 reviewer 派发遇模型 5 小时额度上限中断,未产出完整报告,由 Controller 聚焦核查替代并如实登记
  - 变更登记:无(临时脚手架产物全部撤销)
  - 结论:
    1. 新增 agent = 插件包 + 清单一行,全链路(列表/探测/状态/新建/导入/降级)经真实假插件验证成立,brief 7.1 第一条验收通过
    2. 清单计数守卫(agent-registry.test.ts 钉住 5 条)在临时登记期变红属预期——临时件移除后全量恢复 31 文件/203 用例绿,typecheck exit 0
    3. 去重的 GUI 验证须走「…→导入历史会话」入口;「+」是新建会话,两者症状不同(前者弹窗留消息/后者弹窗关闭+新记录)

## 收尾总结(门 3 确认后)

- 状态:三任务全部完成,brief 7.1 五条验收全部通过(详见门 3 最终报告);整特性终审无 Critical/Important,可合并。
- 终审代跑核实(Controller 本回合执行,证据先于声称):全量 `pnpm test` 31 文件/203 用例绿、`pnpm typecheck` exit 0、`pnpm build` exit 0(产物 out/main/index.js 含 5 枚内联 SVG、5 处品牌色,`svg?raw` 仅存于 Vite 源注释)、`agents-icons` 代码引用零残留(仅 SVG 注释里的 Ported 来源标注)、CSP `img-src 'self' data:` 放行。
- 文档对账:CONTEXT.md「agent 插件」词条已落盘(冻结形态=仓内静态,与 ADR-0006 一致);ADR-0006 在册未变更;AGENTS.md 两条陈旧条目同步——扩展点改为 `plugins/<id>/ + 清单一行`、领域横向依赖双向例外条目删除;spec.md 三处 icon 装载描述同步为 ?raw 口径;T1.md 因契约冻结不改正文,加实现修订注记指向本记录。
- 遗留 Minor(汇总,均不阻断合并):T1 反向守卫不递归子目录/不识别 export-from、未知 agentId fail-loud;T2 console.error 硬断言、已知空 name 不回落、agents:list 启动失败弹窗空列表至重启(契约固化取舍);终审三条(AGENTS.md 两条已修、T1.md/spec.md 漂移已修、冒烟无自动化接缝属 brief waiver)。
- 本次已写入:CONTEXT.md 词条 1 条(agent 插件,此前任务期落盘)、ADR-0006 1 条(门 1 批准时落盘)——对账与文件实况一致,无遗漏。
