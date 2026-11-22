# 侧栏会话行与项目行视觉整理 · 切片

> 2026-11-22 | 状态:草稿

## 任务

- [x] **T1 侧栏行视觉与交互调整**
      交付:项目行无文件夹图标；会话行首 working 旋转动画、行尾状态点全删；双击标题改名（铅笔删除、单击仍打开）；会话行上下留白增加；typecheck 与全量测试绿
      挡谁:无
- [x] **T2 spinner 样式改为 CLI 风格多点转圈**
      交付:会话行首 working 动画从 lucide `LoaderCircle` 改为绿色三点错峰循环闪烁（对齐 agent CLI 的 braille spinner 观感）
      挡谁:无
- [x] **T3 修复切换标签后 working 动画消失**
      交付:定位「切到别的标签页后原 working 会话动画消失、点回才恢复」根因并修复；会话只要仍 working，无论标签页是否激活，侧栏动画保持
      挡谁:无

## 依赖

无前置依赖。两处改动同属一次侧栏视觉整理，评审者无法合理否掉其一而批准其二，合为一个纵向切片，一次会话可完成。

## 遗留项

无（brief 第 6 节未定项为空）。

## 开发记录

- 开工前接口预检 | 无共享接口（本特性只改两个渲染组件的 JSX 与本地交互状态，不新增跨模块接口，不改状态枚举与 store 结构）
- T1 侧栏行视觉与交互调整 | 完成 | commit 5b961a0d
  - 基线:590b729d
  - 评审:规格符合 ✅ / 代码质量通过,无 Critical/Important;Minor 2 条——①200ms 消歧延迟与浏览器双击阈值(常见 400-500ms)的固有张力,属 brief 第 5 节授权 `[我]` 的手感参数,冒烟第 4 条用偏慢双击实测,若复现再调阈值(单常量改动);②删除铅笔后仅剩双击入口,键盘用户无法改名——brief 明确要求「删铅笔」「双击只绑标题」,规格固有,非实现缺陷
  - waiver:无自动化接缝(brief 7.2 / spec 覆盖标准:纯渲染层视觉与交互,项目测试范围为纯逻辑);6 条验收靠手动冒烟,由用户在 pnpm dev 中逐条执行
  - 结论:
    1. 单击/双击消歧用组件内 `useRef` 定时器(200ms),双击到达时 `cancelOpen` 取消打开、卸载时清理;阈值改一处常量即可调
    2. 行首动画只认 `runState === 'working'`;ProjectGroup 既有 `tabs.some` 守卫保证关闭标签页的会话收到 undefined,动画自然消失,本特性未改该守卫
    3. `RUN_STATE_DISPLAY` 保留供 TerminalTabs 的「已退出」标记消费,会话行不再引用其点色
- T2 spinner 样式改为 CLI 风格多点转圈 | 完成 | commit 85e71942
  - 基线:eabe2be3
  - 评审:可提交,无 Critical/Important;Minor 1 条(animate-pulse 正延迟不够逐点亮暗)已采纳——改 900ms 周期 + 负延迟(0 / -600ms / -300ms)三点均匀错峰,立即进入流动相位
  - waiver:无自动化接缝(纯渲染视觉,同 T1 口径);观感靠用户手动冒烟对照 CLI 截图
  - 结论:
    1. 三点 spinner 用三个 span + Tailwind `animate-pulse`,相位由 inline `animationDelay` 负值控制,不新增依赖、不改状态语义
    2. 用户要的是 CLI 那种绿色多点 spinner,不是 lucide 单圈;LoaderCircle 已从 import 移除
- T3 修复切换标签后 working 动画消失 | 完成 | commit 0da1fd56
  - 基线:da752eea
  - 根因(用户实机 DBG 日志确认):隐藏标签(display:none)的 xterm 画面塌缩成 1-2 个空白字符(len=1/2,真实工作画面 len=1800+),`onSnapshot` 照常处理会 `byteBuffer=''` + `markActivity()`,把 working/waiting 字节地标清空、活动时间刷新 → 安静门槛后误判 idle。日志时序:切 B → A 快照 len=1 → A `-> idle`;切回 A → 快照 len=1874 → A `-> working`
  - 评审:初审 Important 1 条(守卫范围过宽)已处置——从 `trim()===''` 收窄为 `length<=2 && trim()===''`,只挡实测的塌缩特征,更长空白仍按既有语义(用例 13);复审 Minor 1 条(用例未锁活动时间)已处置——补 t=600 中间 working 断言 + 最终断言收回 t=2300;两轮复审通过
  - 回归:用例 14(极短空白不清字节证据,waiting 维持)+ 用例 15(working 症状 + 活动时间不刷新),均 red→green;mutation check 两次通过——改坏守卫(14 红)、部分修复仅刷新活动时间(15 红),还原均全绿
  - 取证收尾:3 处临时 DBG- 日志(state:changed / snapshot / active_tab)已全部移除,三处文件零 diff
  - waiver:无(本任务有单测接缝 state-parser,204→205 用例)
  - 结论:
    1. 状态判定空白快照守卫在引擎侧 `onSnapshot` 入口,只挡极短(len<=2)全空白;真实 CLI 画面恒为多字符,不受影响
    2. 该缺陷是既有行为被 T1 改动暴露(此前行尾常驻点让 working/idle 差异不明显),非 T1 引入
    3. 全量 31 文件/205 用例绿、typecheck exit 0;需用户实机复验「切走后动画保持」
- 追加 spinner 迭代(门 3 后第 2 次,用户「要多个点转圈」)| 完成 | commit 106c00f5
  - 基线:1d7409db
  - 变更:用户指出三点 `animate-pulse` 是原地闪烁、不是转圈;改为 CLI 标准 braille 帧序列 `⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏`(10 帧 × 80ms),组件内 `spinnerFrame` state + 仅 working 时运行的定时器驱动,停止态清表省去后台重渲染;绿色 `font-mono`
  - 验证:typecheck exit 0、31 文件/205 用例绿;无 pulse/LoaderCircle 残留
  - 结论:
    1. braille 帧序列逐帧切换 = CLI spinner 的真实形态,点绕圈移动,贴合用户第二张截图
    2. 三次 spinner 迭代历史:LoaderCircle 单圈 → 三点 pulse 闪烁 → braille 帧序列转圈;最终以 braille 为准

## 收尾(门 3 后变更 + 终审清理)

> 本特性在门 3 呈报后收到两项用户反馈,按「小变更直接追加任务」处理为 T2/T3,已全部完成。

- 终审裁决:可进门 3,无 Critical/Important;T1→T3 衔接自洽(动画渲染 vs 状态判定修复分层正确)、无夹带、无残留 DBG 日志
- 终审 Minor 清理(本次一并处理):
  - spec.md 技术选型:LoaderCircle/animate-spin → 三点 animate-pulse(T2 替换),已改并注明来源
  - `ProjectGroup.tsx` 头注释「状态点来源」→「working 动画来源」,已改
  - `run-state-display.ts`:删 `dotClassName` 死字段与四个色值(全仓零消费者),头注释改为「仅标签页 label 消费」,已改;`RUN_STATE_DISPLAY` 保留(TerminalTabs 仍用 `.label`)
  - T1.md 作为历史任务契约未重写(评审建议保留,T2 替换已在 plan.md T2 记录留痕);tasks/ 无 T2/T3 契约属 housekeeping,留后续
- 文档对账:CONTEXT.md 无新术语(loading/三点 spinner 非项目特有),无新 ADR(不改状态语义、不推翻既有决策);本次无需沉淀
- 未验证项(门 3 放行条件):brief 7.1 第 1-6 条视觉/交互为 waiver,用户尚未逐条冒烟;T3「切走后动画保持」需用户实机复验(代码层已由用例 14/15 + mutation 钉住,实机观感未验)
- 遗留 Minor:T1 的 200ms 双击阈值张力(冒烟第 4 条实测,复现则改单常量)、删铅笔后无键盘改名入口(brief 明确要求)
- 验证:31 文件/205 用例绿、typecheck exit 0(清理后重跑)
