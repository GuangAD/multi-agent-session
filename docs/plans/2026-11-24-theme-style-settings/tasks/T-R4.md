# T-R4 设置对话框

> 依赖:T-R1、T-R2、T-R3(同一原子片;界面主题应用落点由本任务定稿) | 对应:brief 第 2 节目标 1、第 5 节「10 套主题平铺、单槽直选」「标题栏三态按钮删除」、第 7.1 节验收 1/3/10

## 实现方式

**干什么**:外观区从「三态三段 + 双槽四下拉」改成「单槽两下拉」;删「主题模式」三段控件;预览块删深浅切换钮。

**输入**:`settings.appTheme` / `settings.terminalTheme`、`APP_THEMES`(12)、`TERMINAL_THEMES`(22)、`DARK/LIGHT_TERMINAL_THEME_NAMES`。

**处理**

1. 删 `THEME_MODES` 常量与「主题模式」整段 JSX(冒烟修复 3 引入的三段控件,ADR-0009 明令删除)。
2. 界面主题:单下拉,`value={settings.appTheme}`,`onChange` → `updateSettings({ appTheme })`;按 `isDark` 分两组显示(`<optgroup label="深色">` / `<optgroup label="浅色">`),组内顺序取 `APP_THEMES` 数组顺序。
3. 终端主题:单下拉,`value={settings.terminalTheme}`,`onChange` → `updateSettings({ terminalTheme })`;按 `DARK_TERMINAL_THEME_NAMES`(深)/ `LIGHT_TERMINAL_THEME_NAMES`(浅)分两组。
4. **删 `patchAppearance`**:界面主题的应用收敛到 App 层 effect(`settings` 变化 → `applyAppearance(getAppTheme(settings))`),对话框只发 patch。J-004 要求的「显式调用写手」仍满足——调用点是 App 层订阅,不是 store 隐式副作用(见 T-R3 第 4 条)。
5. `TerminalPreview` 删深/浅切换钮与 `previewDark` 本地 state(主题单槽后预览即当前主题);`AppearanceSection` 传参不变。

**失败与退出**:落盘失败不回滚显示(slice 既有策略);Esc / ✕ / 完成 三种关闭方式不动。

**Why 不再需要 patchAppearance**:第一版必须重放,是因为 ThemeToggle 的系统跟随 effect 在强制浅/深下直接 return,html 类没有别的更新路径。第二版 ThemeToggle 删除后,App 层订阅是唯一且必然触发的落点,控件再各自重放就是同一动作做两次。

## 接口(伪代码)

落点:`src/renderer/src/components/settings/AppearanceSection.tsx`、`src/renderer/src/components/settings/TerminalPreview.tsx`

```tsx
// 无新导出接口;控件形状与现有 Row/selectClass 一致
<select value={settings.appTheme} onChange={(e) => updateSettings({ appTheme: e.target.value })}>
  <optgroup label="深色">{/* APP_THEMES.filter(t => t.isDark) */}</optgroup>
  <optgroup label="浅色">{/* APP_THEMES.filter(t => !t.isDark) */}</optgroup>
</select>
```

## 开发步骤

1. 删「主题模式」段与 `THEME_MODES`。
2. 界面主题改单下拉 + `optgroup` 分组。
3. 终端主题改单下拉 + `optgroup` 分组。
4. 删 `patchAppearance` 与相关 import(`resolveDark` / `systemPrefersDark` / `applyAppearance` / `selectAppTheme`)。
5. `TerminalPreview` 删切换钮、`Moon`/`Sun` import 与 `previewDark` state。
6. 运行 `pnpm typecheck`;Expected: exit 0。
7. 运行 `pnpm test`;Expected: exit 0,全绿。
8. 冒烟(并入 T-R8 清单,本机无视觉,记 TODO.md):界面主题下拉 12 项分两组 → 选任一立即换色并重启保持;终端主题下拉 22 项分两组 → 已开终端立即换配色。

## 测试规格

无新接缝(UI 接线,控件 → 单字段 patch 是平凡传递;夹紧与校验已由 T-R1 在主进程边界穷尽)。

TDD waiver(契约预登记):纯 UI 接线任务,组件渲染断言属浅覆盖;「选项分组与目录一致」由 T-R2 的目录用例(12 套 / 5 深 7 浅)与 `catalog.test.ts` 的两表划分断言间接钉住,交互由冒烟承担。
