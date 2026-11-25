# T-R6 main 进程

> 依赖:T-R3(shared 新接口,同一原子片) | 对应:brief 第 5 节「isDark 用于主进程原生控件」、ADR-0009 决策第 4 条;spec 覆盖标准接缝三(校验行)

## 实现方式

**干什么**:主进程不再读系统深浅决定应用观感;`nativeTheme.themeSource` 与标题栏 overlay 颜色都按所选界面主题的 `isDark` / token 计算。

**输入**:`store.settings`(单槽)、`shared/themes` 的 `getAppTheme`。

**处理**

1. `settings.ts`(主进程):
   - `applyPatch` 的三态校验已由 T-R1 删除;本任务删残留的 `THEMES` 常量与 `nativeTheme.themeSource = store.settings.theme` 两处。
   - 新增 `syncNativeChrome(store, getWindow)`:取 `getAppTheme(store.settings)`,写 `nativeTheme.themeSource = theme.isDark ? 'dark' : 'light'`,再同步 overlay。
   - 删 `nativeTheme.on('updated', …)` 监听:不再跟随系统,`themeSource` 恒为显式值,监听只会在系统深浅变化时白跑。
   - 启动时(`registerSettingsIpc` 内)与每次 `settings:set` 后各调一次 `syncNativeChrome`。
   - **实施期更正(评审 C1)**:`registerSettingsIpc` 在 `main/index.ts` 里早于 `createAppWindow()` 执行,此刻 `getWindow()` 为 null,启动那次 overlay 同步是**空操作**。故首帧 overlay 必须由建窗路径保证:`createAppWindow(settings)` 接收真实设置(主进程装配处传 `store.settings`),内部用 `getAppTheme(settings).tokens` 着色;§2 原措辞「启动后 registerSettingsIpc 会立刻纠正」不成立,已按此实现。
2. `app-window.ts`:`titleBarOverlayColorsForSettings(settings)` 去掉 `systemDark` 参,内部 `getAppTheme(settings).tokens` 取 `{ color: base, symbolColor: ink }`;`createAppWindow(settings)` 接收真实设置并用 `getAppTheme(settings).tokens` 给 `titleBarOverlay` 首帧着色(实施期更正,见 §1 末条)。

**失败与退出**:无新失败路径;平台判断(`win32`/`darwin`)不动。

**Why 删掉 `nativeTheme.on('updated')`**:该监听是第一版「跟随系统」的产物。第二版 `themeSource` 恒为 `'dark'`/`'light'`,系统深浅变化不会改变 `shouldUseDarkColors`,监听等于空转。

## 接口(伪代码)

落点:`src/main/ipc/settings.ts`、`src/main/app-window.ts`

```ts
// app-window.ts
titleBarOverlayColorsForSettings(settings: Settings): { color: string; symbolColor: string }
  // 用途:标题栏 overlay(系统绘制)配色 = 当前界面主题的 base / ink
  // 怎么用:主进程调用;坏 id 由 getAppTheme 兜底为默认主题

// settings.ts 内部
function syncNativeChrome(store: AppStore, getWindow: () => BrowserWindow | null): void
  // 用途:界面主题 → nativeTheme.themeSource + 标题栏 overlay 颜色
  // 怎么用:注册时调一次;每次 settings:set 之后调一次
```

## 开发步骤

1. `settings.test.ts` 补两条:`appTheme` 改为浅色主题时 `themeSource='light'`(需 mock `electron` 与 `../app-window`,见 T2 结论 1);`appTheme` 坏 id 时仍按默认主题算深色。
2. 运行 `pnpm vitest run src/main/ipc/settings.test.ts`;Expected: FAIL(exit 1),`2 failed`,红因是主进程仍用 `settings.theme`。
3. 改 `settings.ts` 与 `app-window.ts`。
4. 复跑;Expected: PASS(exit 0),`11 passed`(T-R1 后的 9 + 本任务 2),且不是 0 passed。
5. 运行 `pnpm typecheck`;Expected: exit 0。
6. 运行 `pnpm test`;Expected: exit 0,全绿。

## 测试规格

### 接缝 main 原生控件(模块行为,`vi.mock` 字符串路径)

| # | 输入 | 期望 | 期望值来源 |
|---|---|---|---|
| 1 | `appTheme='vscode-light'` 触发一次 `settings:set` | `nativeTheme.themeSource === 'light'`;`setTitleBarOverlay` 收到该套 `base`/`ink` | brief 第 5 节 |
| 2 | `appTheme='nope'` | 按 `github-dark` 算:`themeSource='dark'`,overlay 色为 github-dark 的 base/ink | spec 接口面清单(兜底) |

既有 7 条(字号/行高/字重/光标/字族/单槽 2 条)不回归。
