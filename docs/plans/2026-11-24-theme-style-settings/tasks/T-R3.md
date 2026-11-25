# T-R3 解析与唯一写手

> 依赖:T-R1、T-R2(同一原子片;本任务收尾时 typecheck 必须 0 error) | 对应:brief 第 5 节 isDark 的职责、spec 数据结构节 + 接口面清单、覆盖标准接缝一(降为 3 行)

## 实现方式

**干什么**:解析函数从「三态 × 系统深浅 × 双槽」降为「取一个 id」;`applyAppearance` 改吃整份主题、按 `isDark` 写 `.dark` 与 `color-scheme`;删 `resolveDark` / `systemPrefersDark`。同步把全部消费点改到新签名(编译互锁,必须一片)。

**输入**:设置(形状来自 T-R1)、12 套目录(T-R2)、22 套终端目录(T3 既有)。

**处理**

1. `resolve.ts`:
   - 新增 `getAppTheme(settings: Pick<Settings,'appTheme'>): AppTheme`——坏 id / 空串落 `DEFAULT_APP_THEME_ID` 对应套;**兜底唯一落点**。
   - 新增 `getTerminalTheme(settings: Pick<Settings,'terminalTheme'>): ITheme`——坏名落 `Ghostty Default Style Dark`。
   - `resolveTerminalAppearance(settings)` 去掉 `systemDark` 入参,内部改调 `getTerminalTheme`。
   - 删除 `resolveMode`、`selectAppTheme`、`selectTerminalTheme`、`DEFAULT_DARK_THEME_ID` / `DEFAULT_LIGHT_THEME_ID`。
2. `theme.ts`:
   - `applyAppearance(theme: AppTheme, root?)`:按 `theme.isDark` toggle `.dark`,`color-scheme` 同步,按 `theme.id` 挂 `.theme-<id>`(目录内 id 必挂,不再有「default 不挂类」分支)。
   - 删 `resolveDark`、`systemPrefersDark`、`Theme` 类型、`'default'` 判断。
   - `AppearanceRoot` 保留(测试注入桩),不变。
3. `main.tsx` 首帧防闪:`applyAppearance(systemPrefersDark(), 'default')` 换成 `applyAppearance(getAppTheme({ appTheme: DEFAULT_APP_THEME_ID }))`。**不再读系统深浅**(brief 验收 7:系统深浅不影响观感);注释写明「首帧按默认主题落类,设置回来后由 App 层纠正」。
4. 消费点全部改到新签名(这些改动是本任务的编译必需,不是侵占后续任务):
   - `App.tsx`:删 `matchMedia`/`systemDark` 状态与 `systemPrefersDark` import;`settings` 变化时同一 effect 里 `applyAppearance(getAppTheme(settings))` + `applyTerminalAppearanceToAll(settings)`。
   - `AppearanceSection.tsx`:界面主题改单槽下拉(`settings.appTheme` + `APP_THEMES`,按 `isDark` 分组 optgroup),终端主题改单槽下拉(`settings.terminalTheme`,按 `DARK/LIGHT_TERMINAL_THEME_NAMES` 分组 optgroup),删「主题模式」三段控件与 `THEME_MODES`;`patchAppearance` 删掉(界面主题应用收敛到 App 层 effect,见 T-R4)。
   - `use-terminal.ts` / `TerminalView.tsx`:见 T-R5(本任务只改到能编译:去掉 `systemDark` 参数与传参)。
   - `settings.ts`(主进程)/ `app-window.ts`:见 T-R6(去掉三态与 `systemDark`)。
   - `ThemeToggle.tsx` 与 App 里的使用:删除,见 T-R7。
5. `resolve.test.ts` 改口径:接缝一降为 3 行(坏 id 落默认、目录内取到、`isDark` 与 token 组一致),接缝二保留 5 条但去掉 `systemDark` 入参;`theme.test.ts` 6 条按新签名重写(注入 root 桩不变)。

**失败与退出**:解析不抛出;坏 id 落默认。`applyAppearance` 无失败路径。

## 接口(伪代码)

落点:`src/shared/themes/resolve.ts`、`src/renderer/src/theme.ts`、`src/renderer/src/main.tsx`

```ts
// resolve.ts
export function getAppTheme(settings: Pick<Settings, 'appTheme'>): AppTheme
  // 用途:设置 → 界面主题(整套 token + isDark)
  // 怎么用:纯函数;坏 id / 空串 / 目录外 → DEFAULT_APP_THEME_ID
export function getTerminalTheme(settings: Pick<Settings, 'terminalTheme'>): ITheme
  // 用途:设置 → 终端配色;坏名 → 'Ghostty Default Style Dark'
export function resolveTerminalAppearance(settings: Settings): TerminalAppearance
  // 用途:设置 → xterm 全量外观;仍输出 fontFamily/fontSize/fontWeight/fontWeightBold/
  //   lineHeight/cursorStyle/cursorBlink/theme/scrollback 九字段
  // 怎么用:构造与运行时更新共用;不再有 systemDark 维度

// theme.ts
export function applyAppearance(theme: AppTheme, root?: AppearanceRoot): void
  // 用途:html 类与 color-scheme 的唯一写手
  // 怎么用:任意时机重复调用,全量重写(清掉全部目录内主题类再挂当前);
  //   .dark 由 theme.isDark 决定,color-scheme 同
  // 出错时:无失败路径
```

## 开发步骤

1. 改 `resolve.test.ts`(新签名 + 3 行矩阵);运行 `pnpm vitest run src/shared/themes/resolve.test.ts`;Expected: FAIL(exit 1),红因是 `getAppTheme` / `getTerminalTheme` 未导出(动态导入结构使整文件用例失败,非套件级)。
2. 改 `resolve.ts`;复跑;Expected: PASS(exit 0),`11 passed`(getAppTheme 3 + getTerminalTheme 2 + resolveTerminalAppearance 6),且不是 0 passed。(评审 M6 勘误:原写 13 passed 且算式不自洽;实现落地为 11 条)
3. 改 `theme.test.ts`(新签名);运行 `pnpm vitest run src/renderer/src/theme.test.ts`;Expected: FAIL(exit 1),红因是 `applyAppearance` 仍收 `(dark, id)`。
4. 改 `theme.ts`;复跑;Expected: PASS(exit 0),`6 passed`(深色非默认、默认主题挂类、切换清旧类幂等、目录外兜底、全部目录 id 对齐、isDark 与 color-scheme 衔接)。
5. 改 `main.tsx` 首帧调用。
6. 改剩余消费点(App / AppearanceSection / use-terminal / TerminalView / settings.ts / app-window / 删 ThemeToggle),使全仓可编译。
7. 运行 `pnpm typecheck`;Expected: exit 0(原子片至此第一次全绿)。
8. 运行 `pnpm test`;Expected: exit 0,全绿(条数见 T-R8 验收记录)。

## 测试规格

### 接缝一 主题选择解析(3 行,替代第一版 6 行矩阵)

| # | 输入 | 期望 | 期望值来源 |
|---|---|---|---|
| 1 | `appTheme='carbonfox'` | 返回 carbonfox 套,`isDark=true`,token 等于目录值 | spec 接缝一(降为 3 行) |
| 2 | `appTheme='nope'` / 空串 | 返回 `github-dark` 套 | spec 接口面清单 |
| 3 | `terminalTheme='Builtin Tango Light'` / `'nope'` | 前者返回对应 ITheme,后者返回 `Ghostty Default Style Dark` | spec 接口面清单 |
| 4 | 任一合法 id | 返回套的 `isDark` 与其 token 组一致(深色套的 base 明度低于 ink) | brief 第 5 节 |

### 接缝二 终端外观解析(原 5 条,去掉 systemDark)

保留第一版用例 6-10 的判据(字族缺省/具体字体/字号夹紧/行高夹紧/光标枚举),签名改 `(settings)`;`theme` 出参改为由 `terminalTheme` 单槽决定。

### 接缝 applyAppearance(唯一写手)

| # | 输入 | 期望 | 期望值来源 |
|---|---|---|---|
| 1 | `github-dark` | 挂 `.dark` + `.theme-github-dark`,`color-scheme: dark` | brief 第 5 节 |
| 2 | `vscode-light` | 不挂 `.dark`,挂 `.theme-vscode-light`,`color-scheme: light` | brief 第 5 节 |
| 3 | 先 `carbonfox` 再 `tomorrow` | 只留 `.theme-tomorrow`,旧类清空(幂等) | spec 唯一写手 |
| 4 | 任意目录内 id 逐个调用 | 12 个 id 都能挂上对应类 | 目录对齐 |
| 5 | 构造的坏 id 传入(目录外) | 不挂任何 `.theme-*`(兜底由 `getAppTheme` 负责,写手不做二次兜底) | 契约 |

mutation check:`applyAppearance` 里把 `isDark` 判断去掉 → 用例 2 精确转红。
