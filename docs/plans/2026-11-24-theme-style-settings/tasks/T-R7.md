# T-R7 标题栏清理

> 依赖:T-R3(同一切片) | 对应:brief 第 5 节「标题栏三态循环按钮删除」、第 7.1 节验收 10、ADR-0009 决策第 3 条

## 实现方式

**干什么**:删掉标题栏的主题三态循环按钮(组件文件 + App 里的使用),齿轮设置入口保留。

**输入**:无。

**处理**

1. 删 `src/renderer/src/components/ui/ThemeToggle.tsx`。
2. `App.tsx` 删 `import { ThemeToggle }` 与该行 JSX;齿轮按钮(aria-label「设置」)原位保留。
3. `App.tsx` 顶部注释里「三态由 ThemeToggle 写类并持久化」一句改为现状描述(界面主题由 App 层 effect 经 `applyAppearance` 落地)。
4. 全仓 grep `ThemeToggle` / `resolveDark` / `systemPrefersDark` / `selectAppTheme` / `selectTerminalTheme`,结果必须为 0 处(仅 `docs/` 与 `.reference/` 允许出现)。四个旧槽键名(`appThemeDark` / `appThemeLight` / `terminalThemeDark` / `terminalThemeLight`)按第 2 步的豁免判定:**必须**留在 `store-persistence.ts` 的迁移逻辑与迁移用例中(复审 P2-1:此前本条与豁免互斥)。

**失败与退出**:无失败路径。

**Why 删除而不是保留一个禁用按钮**:brief 第 5 节是用户明令删除;留着会让人以为还有三态,也保住一条读旧字段的路径。

## 接口(伪代码)

无新接口;仅删除。

## 开发步骤

1. 删组件文件、改 `App.tsx` 两处(import + JSX,注释同步)。
2. 残留扫描:`grep -rn "ThemeToggle\|resolveDark\|systemPrefersDark\|selectAppTheme\|selectTerminalTheme" src/`;Expected: 0 行。
   **豁免(评审 I2 登记)**:`appThemeDark` / `appThemeLight` / `terminalThemeDark` / `terminalThemeLight` 四个旧键名**必须**保留在 `store-persistence.ts` 的迁移逻辑(`firstMatching` 调用处与 `LEGACY_SETTINGS_KEYS`)与迁移/忽略用例中——T-R1 的迁移语义离不开它们。故旧键名的残留判据是「除迁移逻辑与其用例之外 0 处」;两条契约原本互斥,以此为准。
3. 运行 `pnpm typecheck`;Expected: exit 0。
4. 运行 `pnpm test`;Expected: exit 0,全绿。
5. 冒烟:标题栏只剩齿轮(设置)与面板动作,无主题按钮(记 TODO.md,本机无视觉)。

## 测试规格

无新接缝。删除型任务,验证由第 2 步残留扫描与 typecheck 承担(孤儿 import 不清理会直接被 typecheck/构建抓出)。
