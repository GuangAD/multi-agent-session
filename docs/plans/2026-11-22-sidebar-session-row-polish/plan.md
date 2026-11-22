# 侧栏会话行与项目行视觉整理 · 切片

> 2026-11-22 | 状态:草稿

## 任务

- [x] **T1 侧栏行视觉与交互调整**
      交付:项目行无文件夹图标；会话行首 working 旋转动画、行尾状态点全删；双击标题改名（铅笔删除、单击仍打开）；会话行上下留白增加；typecheck 与全量测试绿
      挡谁:无
- [x] **T2 spinner 样式改为 CLI 风格多点转圈**
      交付:会话行首 working 动画从 lucide `LoaderCircle` 改为绿色三点错峰循环闪烁（对齐 agent CLI 的 braille spinner 观感）
      挡谁:无
- [ ] **T3 修复切换标签后 working 动画消失**
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
