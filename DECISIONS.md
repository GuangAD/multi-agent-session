# DECISIONS — 项目判断台账

> 判断的当前状态。历史不改写:被推翻的条目不删,只改状态行。

## J-001 设置全局一份

- 状态:有效 · 2026-11-24 · 来源:`docs/plans/2026-11-24-theme-style-settings/brief.md` 第 5 节
- 判断:设置全局一份(应用级),不做按项目覆盖;后续新增设置项一律沿用

## J-002 界面颜色只经语义 token 层

- 状态:有效 · 2026-11-24 · 来源:`docs/plans/2026-11-24-theme-style-settings/brief.md` 第 5 节
- 判断:渲染层界面颜色一律取语义 token(CSS 变量),组件不得新增硬编码调色板色
- 升格:ADR-0008

## J-003 设置里的数字输入一律草稿态提交

- 状态:有效 · 2026-11-24 · 来源:`docs/plans/2026-11-24-theme-style-settings/plan.md` 终审 P1-1 处置
- 判断:设置面板的数字项不得把 `value` 直连 store 并逐键 patch,须用草稿态(失焦/回车提交);否则主进程夹紧回写会改写输入中的值,并让每次按键触发重建类副作用
- 波及:后续任何带数值设置的特性(组件 `components/settings/NumberField.tsx` 可复用)

## J-004 设置类 store 变更不自动重放外观

- 状态:有效 · 2026-11-24 · 来源:`docs/plans/2026-11-24-theme-style-settings/plan.md` T6/T7 记账
- 判断:改设置只更新 store,不会自动触发界面/终端重绘;写手(`applyAppearance` / `applyTerminalAppearanceToAll`)的调用点必须**显式且唯一**,不得依赖 store setter 内的隐式副作用。2026-11-24 第二版修订:调用点从「每个外观控件的 `patchAppearance`」收敛到 App 层 `settings` 订阅 effect(`App.tsx`)+ 终端构造期取值——控件只发 patch,单一入口负责重放;字面表述已按实现更新(评审 M1)
- 波及:后续新增任何外观设置项;`docs/plans/2026-11-24-theme-style-settings/tasks/T-R4.md` 第 4 条

## J-005 界面主题单槽单色板,不跟随系统

- 状态:有效 · 2026-11-24 · 来源:`docs/plans/2026-11-24-theme-style-settings/brief.md` 第 5 节(第二版)
- 判断:主题为「一套 = 一组 token」的单槽直选,不设深浅双槽、不跟随系统;每套带 `isDark` 只用于 color-scheme 与原生控件着色
- 取代:ADR-0008 的「深浅双槽」结构部分(语义 token 层部分继续有效);本条目升格 ADR-0009

## J-006 第三方上游缺陷照搬 Orca 补丁重放

- 状态:有效 · 2026-11-25 · 来源:`docs/plans/2026-11-25-terminal-backpressure/brief.md` 第 5 节 · 2026-11-26 由重复编号的 J-003 改号为 J-006(判断内容一字未改)
- 判断:第三方包(xterm / node-pty 等)的上游缺陷,优先照搬 Orca `config/patches` 根级补丁,经 pnpm patchedDependencies 重放修复;不自研包装层绕过;升级依赖版本前须重新生成补丁
- 波及:终端背压特性全部补丁层任务;后续 addon-webgl 等补丁同策略

## J-007 续接原料只持久化 agent 侧会话 id

- 状态:有效 · 2026-11-26 · 来源:2026-11-23 用户裁决(pi 的 `--session` 接受完整/部分 id)+ 2026-11-26 死代码清理(commit `74f0c8c6`)
- 判断:会话记录只保存 `externalSessionId`(agent 侧会话 id)作为续接原料,五家 agent 的 `resumeArgv` 一律只用它;**不把转录文件路径写进会话记录**。扫描候选上的 `ImportCandidate.filePath` 属另一件事(回填 mtime 新鲜度判定、codex 明文与 `.zst` 取舍),不得因本条一并删除
- 波及:新增 agent 插件时只实现 `resumeArgv({ id })`;若某 agent 只能按文件路径续接,须先在本条上登记例外再改契约

## J-008 行内浮层用 fixed 定位,不挂在滚动容器内

- 状态:有效 · 2026-11-26 · 来源:侧栏「更多」面板裁剪修复(commit `95ad95fa`)
- 判断:锚定某一行的弹出层(dropdown / 小菜单)一律用 `position: fixed` + 按触发元素的 `getBoundingClientRect()` 现算坐标(下方不足则向上翻、边界夹取),不用 `absolute` 挂在滚动容器内部——祖先 `overflow` 的裁剪优先于 `z-index`。整仓布局链刻意不含 `transform`/`filter`/`backdrop-filter` 祖先,故 `fixed` 以视口为参照;若将来引入此类属性,浮层会退化为相对该祖先定位,须改用 portal
- 波及:侧栏、文件树、Git 面板将来任何行内浮层;不再新造 `overflow` 内的 `absolute` 浮层
