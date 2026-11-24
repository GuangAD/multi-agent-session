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
- 判断:改设置只更新 store,不会自动触发界面/终端重绘;每个改变外观的控件必须在上游(`patchAppearance` 一类)显式调用写手(`applyAppearance` / 终端应用函数)
- 波及:后续新增任何外观设置项;`docs/plans/2026-11-24-theme-style-settings/tasks/T6.md` 实施期补充第 1 条
