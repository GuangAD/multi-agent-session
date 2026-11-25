# T-R2 界面主题数据 12 套

> 依赖:T-R1(同一原子片) | 对应:brief 第 5 节主题清单、spec 数据结构节(app-themes / theme-tokens.css)、覆盖标准接缝四 + 接缝六

## 实现方式

**干什么**:把 8 套 × 深浅两形态的界面主题目录换成 12 套单色板 + `isDark`;CSS 出 12 个 `.theme-<id>` 块,`:root`/`.dark` 留兜底;两份数据由生成器产出,不手抄。

**输入**:`docs/plans/2026-11-24-theme-style-settings/theme-selection-tokens.json`(12 套 × 10 token,三处主色覆盖已固化)。

**处理**

1. **先重排 `theme-tokens.css`,再跑生成器**。生成器按标记行 `/* —— 主题块(由 gen-theme-data.py 生成,勿手改) —— */` split 后整段重写标记**之后**的内容——当前文件没有该标记,且 color-scheme / 表单控件规则排在主题块**之后**;不先重排,这些规则会被生成器直接丢掉(与第一版 T1 的「注释吞 @import」同一类事故)。目标顺序:
   1. `:root` 兜底变量(沿用现有灰阶,注释改为「兜底:设置加载前与目录外 id 的观感」)
   2. `.dark` 兜底变量
   3. `color-scheme` 两条(`:root` light / `.dark` dark)+ 表单控件 `color-scheme: inherit` 与 `option` 着色
   4. 标记行 + 12 个 `.theme-<id>` 块(生成器产出)
   同时删除现有 8 套 `.dark.theme-<id>` 成对结构与 `.theme-warm` 等旧块。
2. 运行 `python docs/plans/2026-11-24-theme-style-settings/gen-theme-data.py`;产出 `src/shared/themes/app-themes.ts`(12 套、`isDark`、`DEFAULT_APP_THEME_ID`)与 CSS 主题块。
3. 目录口径:深色 5 套(`github-dark`、`github-dark-hc`、`vscode-dark-modern`、`carbonfox`、`tango-dark`),浅色 7 套(`vscode-light`、`github-light`、`gruvbox-light-hard`、`selenized-white`、`tango-light`、`flexoki-light`、`tomorrow`);默认 `github-dark`。
4. `app-themes.test.ts` 改口径:12 套 × 1 形态 × 10 token、id 唯一且属联合类型、色值 `#rrggbb`、`isDark` 与上述 5/7 分组一致、`DEFAULT_APP_THEME_ID` 在目录内。
5. `app-themes-css.test.ts` 改口径:去掉「default 套 = :root/.dark 基准」用例(不再有 default),改为 12 个 `.theme-<id>` 块逐一与目录比对 + 断言无 `.dark.theme-` 残留。

**失败与退出**:纯数据,无运行时失败路径。生成器缺主题会 assert 失败,直接红。

**Why 由生成器写而不是手抄**:12 × 10 = 120 个色值,TS 与 CSS 两份必须逐值一致(接缝六会比对),手抄必错;生成器是唯一真值入口,改色只改 JSON。

## 接口(伪代码)

落点:`src/shared/themes/app-themes.ts`(生成,勿手改)、`src/renderer/src/assets/theme-tokens.css`、`src/shared/themes/app-themes.test.ts`、`src/shared/themes/app-themes-css.test.ts`

```ts
export type AppThemeId = 'github-dark' | 'github-dark-hc' | 'vscode-dark-modern' | 'carbonfox'
  | 'tango-dark' | 'vscode-light' | 'github-light' | 'gruvbox-light-hard' | 'selenized-white'
  | 'tango-light' | 'flexoki-light' | 'tomorrow'

export type AppTheme = { id: AppThemeId; name: string; isDark: boolean; tokens: AppTokenValues }
export const APP_THEMES: AppTheme[] // 恰 12 套,深色在前浅色在后(下拉顺序)
export const DEFAULT_APP_THEME_ID: AppThemeId // 'github-dark'
```

## 开发步骤

1. 重排 `theme-tokens.css`(顺序见上),删旧 8 套主题块与 `.dark.theme-<id>` 结构,放好标记行。
2. 改 `app-themes.test.ts` 与 `app-themes-css.test.ts` 口径;运行 `pnpm vitest run src/shared/themes/app-themes.test.ts src/shared/themes/app-themes-css.test.ts`;Expected: FAIL(exit 1),`4 failed`(2 + 2),红因是 `app-themes.ts` 仍是 8 套双形态、CSS 仍是旧块。
3. 跑生成器;复跑同命令;Expected: PASS(exit 0),`4 passed`,且不是 0 passed。
4. 人工核对生成结果:CSS 里 `.theme-` 块恰 12 个、无 `.dark.theme-`、`--app-*` 每块 10 个;`app-themes.ts` 里 12 个 `id:`。
5. **不做 `pnpm typecheck`**:`resolve.ts` / `theme.ts` 仍按旧形状读 `theme.light` / `theme.dark`,typecheck 必红,由 T-R3 收尾一次通过。

## 测试规格

### 接缝 APP_THEMES 目录(模块完整性)

| # | 输入 | 期望 | 期望值来源 |
|---|---|---|---|
| 1 | 全目录扫描 | 恰 12 套、id 唯一且属联合类型、每套 10 token 齐、色值 `#rrggbb` | spec 接缝四 |
| 2 | 全目录扫描 | 深色 5 套与浅色 7 套的 id 集合与 `isDark` 完全对应;`DEFAULT_APP_THEME_ID='github-dark'` 且存在于目录 | 契约目录口径 |

### 接缝六 主题与 CSS 一致

| # | 输入 | 期望 | 期望值来源 |
|---|---|---|---|
| 3 | 读 `theme-tokens.css` | 恰 12 个 `.theme-<id>` 块,每块 10 个 `--app-*` 与 `APP_THEMES` 同 id 逐值一致 | spec 接缝六 |
| 4 | 同上 | 无 `.dark.theme-` 残留(成对结构已删);块数与目录套数相等 | 契约第 1 步 |

mutation check:CSS 里改任一套主题任一 token 末位 → 用例 3 精确转红;还原后 4 passed。
