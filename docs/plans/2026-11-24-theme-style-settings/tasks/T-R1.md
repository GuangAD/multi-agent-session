# T-R1 数据结构与迁移

> 依赖:无(与 T-R2、T-R3 编译互锁,同一原子片交付) | 对应:brief 第 2 节目标 8、第 5 节默认值与边界、第 7.1 节验收 9;spec 数据结构节、覆盖标准接缝三(迁移行)

## 实现方式

**干什么**:Settings 的三态 + 深浅双槽换成 `appTheme` / `terminalTheme` 单槽;默认值三处同步;`loadStore` 做旧字段一次性迁移;`applyPatch` 校验换单槽。

**输入**:store.json 旧内容(第一版格式:`theme` 三态 + 四个槽字段)、渲染层 `settings:set` patch。

**处理**

1. `src/shared/types.ts`:删 `theme`、`appThemeDark`、`appThemeLight`、`terminalThemeDark`、`terminalThemeLight`;加 `appTheme: string`(默认 `'github-dark'`)与 `terminalTheme: string`(默认 `'Ghostty Default Style Dark'`)。其余字段一个不动。
2. `DEFAULT_STORE.settings`(`store-persistence.ts`)换单槽默认值,`theme` 删除。它是「新字段默认值唯一来源」,`loadStore` 补缺依据。
3. `loadStore` 增加 settings 归一化:旧字段迁移 + 五个旧键不进入内存 store。**旧键必须删**:整文件写回会把残留旧字段永久带着走,下次迁移逻辑再改也清不掉。
4. `applyPatch` 删三态校验,增单槽校验(非空字符串才写,内容合法性交给渲染层解析兜底,与第一版主题槽同款口径)。
5. `settings-slice.ts` 的 `INITIAL_SETTINGS` 同步为单槽初值(渲染层不可 import main,只能手工镜像);`settings-slice.test.ts` 的 `BASELINE` / `LOADED` 字面量同步。

**归一化规则(顺序敏感;spec 数据结构节「旧数据迁移」+ 覆盖标准接缝三新增迁移行)**

- `appTheme`:source 里 `appTheme` 为非空 string → 原样保留(坏 id 由 `getAppTheme` 兜底,与「内容合法性不在 load 层校验」口径一致);否则依次试 `appThemeDark`、`appThemeLight`,**取第一个落在 `APP_THEMES` 12 套目录内的值**;都不中 → `'github-dark'`。
- `terminalTheme`:source 里 `terminalTheme` 为非空 string → 原样保留;否则依次试 `terminalThemeDark`、`terminalThemeLight`,**取第一个仍在 `TERMINAL_THEMES` 22 套目录内的名字**;都不中 → `'Ghostty Default Style Dark'`。
- 五个旧键(`theme` / `appThemeDark` / `appThemeLight` / `terminalThemeDark` / `terminalThemeLight`)一律删除。

**Why 主进程可以 import shared/themes**:shared 是双端共享契约层,主进程从来就能 import(不可 import 的只有 renderer)。旧主题 id(`default`/`warm`/…)全部不在新目录,所以「迁移要不要校验目录」只能在主进程用 shared 的真目录判断,不能复制一份 id 清单。

**失败与退出**:坏值忽略或夹紧,不抛出;落盘仍走既有原子写,失败控制台报错。

## 接口(伪代码)

落点:`src/shared/types.ts`、`src/main/session-store/store-persistence.ts`、`src/main/ipc/settings.ts`、`src/renderer/src/store/settings-slice.ts`

```ts
interface Settings {
  // ……既有:defaultAgentId?、scrollbackRows、shell,不动
  appTheme: string // 界面主题 id,默认 'github-dark'
  terminalTheme: string // 终端配色名(Orca 原名),默认 'Ghostty Default Style Dark'
  // ……既有:terminalFontFamily?、terminalFontSize、terminalFontWeight、
  //   terminalLineHeight、terminalCursorStyle、terminalCursorBlink,不动
}

// store-persistence.ts 内部(不导出,归一化细节可直测)
function normalizeSettings(raw: unknown): Settings
  // 用途:loadStore 的 settings 分支——补默认 + 旧字段迁移 + 删旧键
  // 怎么用:入参为 JSON.parse 后的任意值(可能非对象);返回全新 Settings
  // 出错时:不抛出;非对象入参按空对象处理,全落默认

applyPatch(settings: Settings, patch: Partial<Settings>): void
  // 用途:渲染层 patch 合入内存设置,坏值挡在 store 之外
  // 怎么用:原地修改;每次调用独立;三态校验删除,改为 appTheme/terminalTheme 非空 string
  // 出错时:不抛出;非目标类型忽略,数值越界夹紧
```

## 开发步骤

1. 改 `types.ts`(两字段)。
2. `store-persistence.test.ts` 按「测试规格」改写迁移用例;运行 `pnpm vitest run src/main/session-store/store-persistence.test.ts`;Expected: FAIL(exit 1),`9 failed | 3 passed`(实测口径:除迁移用例外,「写入再读取」等既有用例也因 FIXTURE 仍含旧字段而红),红因是归一化未实现、旧值被 spread 直通。
3. `store-persistence.ts` 实现 `normalizeSettings` 与 `DEFAULT_STORE.settings` 单槽;复跑;Expected: PASS(exit 0),`13 passed`(既有 6 + 迁移 7,含评审 I1 补的第 7 条),且不是 0 passed。
4. `settings.test.ts` 改写槽字段用例;运行 `pnpm vitest run src/main/ipc/settings.test.ts`;Expected: FAIL(exit 1),`2 failed`,红因是 `applyPatch` 仍写旧字段。
5. `settings.ts` 换单槽校验;复跑;Expected: PASS(exit 0),`10 passed`(既有 7 + 单槽 2 + 旧字段忽略 1,实测口径),且不是 0 passed。
6. `settings-slice.ts` 与 `settings-slice.test.ts` 字面量换单槽;运行 `pnpm vitest run src/renderer/src/store/settings-slice.test.ts`;Expected: PASS(exit 0),`4 passed`(纯口径同步,无新逻辑,预期直接绿)。
7. **不做 `pnpm typecheck`**:本任务改的是数据结构,`resolve.ts` / `theme.ts` / 组件仍读旧字段,typecheck 必红;typecheck 在原子片末尾(T-R3 收尾)一次通过。

## 测试规格

### 接缝 loadStore(storePersistence,模块行为)

fixture 回放:临时目录写 store.json 变体后 loadStore 断言。

| # | 输入 | 期望 | 期望值来源 |
|---|---|---|---|
| 1 | 第一版文件:`theme='dark'`、`appThemeDark='warm'`、`appThemeLight='cool'`、`terminalThemeDark='Tango Dark'`、`terminalThemeLight='Builtin Tango Light'` | `appTheme='github-dark'`(旧 id 不在 12 套目录);`terminalTheme='Tango Dark'`(仍在 22 套目录,迁移成功);`theme` 与四个旧键在结果对象上不存在 | spec 覆盖标准接缝三迁移行 |
| 2 | 第一版文件:双槽旧 id 全不在目录(`warm`/`cool` + `Nope Dark`/`Nope Light`) | `appTheme='github-dark'`、`terminalTheme='Ghostty Default Style Dark'`,两字段各自独立兜底 | 契约归一化规则 |
| 3 | 新格式文件(`appTheme='carbonfox'`、`terminalTheme='Tango Dark'` + 外观六项自定义) | 原值全部保留不清洗 | spec 接缝三 |
| 4 | 新格式文件缺 `appTheme`、其余新字段在 | `appTheme` 落默认,其余保留(迁移只补缺,不改有) | spec 接缝三 |
| 5 | 新格式文件缺 `terminalFontSize` | 补默认,其余保留 | spec 接缝三 |
| 6 | `settings` 为字符串 | 既有损坏兜底路径返回全默认,不抛出、不改名原文件 | 既有行为回归 |
| 7(评审 I1 补) | 双槽首个旧值不在目录、第二个在目录(`appThemeDark='warm'` + `appThemeLight='github-light'`;`terminalThemeDark='Nope Dark'` + `terminalThemeLight='Builtin Tango Light'`) | `appTheme='github-light'`、`terminalTheme='Builtin Tango Light'`(依次试,不是直接落默认) | 契约归一化规则「依次试」 |

### 接缝 applyPatch(模块行为)

| # | 输入 | 期望 | 期望值来源 |
|---|---|---|---|
| 7 | `appTheme` 为数字 / 空串 / 合法 string 三种 | 前两者忽略,第三写入 | 契约校验细则 |
| 8 | `terminalTheme` 同上 | 同上 | 契约校验细则 |
| 9 | patch 带旧字段 `theme='dark'`、`appThemeDark='warm'` | 一律忽略(类型上已无这些字段,运行时也不得写进内存对象) | brief 第 5 节删除项 |

既有 7 条(字号/行高/字重/光标/字族守卫)全部保留不回归。
