# 侧栏会话行与项目行视觉整理 · 技术规格

## 整体实现

纯渲染层改动，数据流不变：主进程 `state:changed` 广播 → `run-state-slice` 的 `runStates` → `ProjectGroup` 按「该会话是否有打开的标签页」决定是否传 `runState` → `SessionRow`。本特性在这个链条的末端改两处组件：项目行删掉 `<Folder>` 图标，只留 chevron 与动作按钮；会话行按传入的 `runState === 'working'` 在徽标左侧渲染旋转动画、删除行尾状态点渲染，把标题区改为双击进入本地编辑态（`editing`/`draft` 状态沿用现有），铅笔按钮删除，行容器上下 padding 增大。单击打开与双击改名的消歧用组件内短定时器：单击延迟触发 `onOpen`，双击到达时取消定时器并进入编辑。不改状态枚举、引擎、IPC、store 与持久化。

## 数据结构

无新增或修改的数据结构。`SessionRunState`、`SessionRow` props、`runStates` 形状均不变；`editing`/`draft` 是组件既有本地 state。

## 模块划分

- `src/renderer/src/components/sidebar/ProjectGroup.tsx` — 项目行渲染；删除 `<Folder>` 图标 import 与元素，chevron / 「+」/「…」及折叠、新建、导入行为不变
- `src/renderer/src/components/sidebar/SessionRow.tsx` — 会话行渲染与本地交互；行首 working 动画、行尾状态点删除、双击改名单击消歧、铅笔删除、上下 padding
- `src/renderer/src/run-state-display.ts` — 运行状态展示单一来源；会话行不再消费 `RUN_STATE_DISPLAY` 的 `dotClassName`，但标签页「已退出」标记仍消费 `label`，该文件保留不改

依赖方向：仅渲染组件内部，无跨层新增依赖。

## 技术选型与约束

- loading 用 CLI 标准 braille 帧序列 `⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏`（10 帧 × 80ms 逐帧切换、点绕圈移动），绿色 `font-mono`；仅 working 时驱动定时器；不新增依赖。迭代史：LoaderCircle 单圈 → 三点 pulse 闪烁 → braille 帧序列（见 plan.md）
- 单击/双击消歧用组件内 `useRef` 存定时器 id，cleanup 在组件卸载时清除，避免 setState on unmounted
- 双击只绑在标题元素上，不绑整个行主体；删除按钮与编辑态保持原有命中区
- `RUN_STATE_DISPLAY` 保留供标签页使用，不因会话行不消费而删除

## 覆盖标准

档位:抽样档

理由:本特性是纯渲染层视觉与交互调整，无数据计算、无维度组合、错误代价是显示或交互错而不是算错；项目测试范围为纯逻辑，组件交互无自动化接缝，按 brief 7.2 预登记 waiver，验收靠手动冒烟。

最可能咬到的五种情况:

1. 项目行 Folder 删除后 chevron /「+」/「…」仍在且可点 → 手动冒烟
2. working 会话行首出现旋转动画、行尾无点 → 手动冒烟
3. 非 working 态与无标签页会话：行首无动画、行尾无点 → 手动冒烟
4. 双击标题进改名、单击仍打开、两者不串扰 → 手动冒烟
5. Enter 提交 / Esc 取消 / 空名不提交，与既有改名行为一致 → 手动冒烟

隐含高风险输入:标签页关闭后残留 working 动画（由 ProjectGroup 既有 `tabs.some` 守卫挡住，runState 传 undefined，本特性不改该守卫）；定时器在改名前触发误打开（卸载与进入编辑时清理定时器）。二者均无自动化接缝，纳入冒烟 3、4。

## 接口面清单

- `SessionRow` — 非接缝 — 侧栏会话行组件；props 与本地 state 形状不变，只改渲染与交互
- `ProjectGroup` — 非接缝 — 侧栏项目行组件；只删图标元素
- `RUN_STATE_DISPLAY` — 非接缝 — 运行状态展示单一来源；会话行不再消费其点色，标签页继续消费其文案
