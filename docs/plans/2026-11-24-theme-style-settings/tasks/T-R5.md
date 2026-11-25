# T-R5 终端接线

> 依赖:T-R3(resolve 新签名,同一原子片) | 对应:brief 第 2 节目标 3、第 5 节「终端主题单槽」、第 7.1 节验收 2/4/5/6/7;spec 覆盖标准接缝五

## 实现方式

**干什么**:终端外观解析不再有 `systemDark` 维度;`openTerminal` 与 `applyTerminalAppearanceToAll` 的入参收成 `settings` 一份;App 去掉 `matchMedia` 与系统深浅状态。

**输入**:`settings`(单槽,含 `terminalTheme`)、已开终端注册表(use-terminal 既有)。

**处理**

1. `openTerminal(sessionId, scrollback, settings, container)`:删第 4 参 `systemDark`,内部 `resolveTerminalAppearance(settings)`。
2. `applyTerminalAppearanceToAll(settings)`:同上,删 `systemDark`。
3. `TerminalView.tsx`:调用点同步(仍命令式读 `useAppStore.getState().settings`,不订阅,理由不变)。
4. `App.tsx`:删 `systemDark` 状态、`matchMedia` effect、`systemPrefersDark` import;effect 依赖收成 `[settings]`,同一 effect 里先 `applyAppearance(getAppTheme(settings))` 再 `applyTerminalAppearanceToAll(settings)`(界面主题的应用落点,见 T-R3/T-R4)。
5. `use-terminal.test.ts`:删第一版用例 3(「systemDark 参数传递换槽」——维度已不存在),补一条「终端主题改名后 applyToAll 换配色」,原用例 1/2 保留并改签名。

**失败与退出**:解析不抛出;注册表为空时遍历空集。隐藏终端跳过 fit 的守卫不动(终审 P1-2 的既有成果,不得回退)。

**Why 系统深浅彻底断线**:brief 验收 7「系统深浅变化不影响应用观感」。留着 `matchMedia` 只在系统深浅变化时白跑一次 applyToAll,且会让人误以为还有跟随语义。

## 接口(伪代码)

落点:`src/renderer/src/components/terminal/use-terminal.ts`、`src/renderer/src/components/terminal/TerminalView.tsx`、`src/renderer/src/App.tsx`、`src/renderer/src/components/terminal/use-terminal.test.ts`

```ts
openTerminal(sessionId: SessionId, scrollback: number, settings: Settings, container: HTMLElement): void
  // 用途:创建终端;options 全量来自 resolveTerminalAppearance(settings)
  // 怎么用:语义同既有;scrollback 仍是创建期参数(变化即重建)

applyTerminalAppearanceToAll(settings: Settings): void
  // 用途:设置变化后把解析结果应用到全部已开终端
  // 怎么用:可重复调用、幂等;每终端 options setter 后走既有 fit 路径(隐藏态跳过)
  // 出错时:单终端失败不阻断其余,console.error 记录该终端
```

## 开发步骤

1. 改 `use-terminal.test.ts` 三处签名与用例(删 systemDark 用例、补 terminalTheme 换色用例);运行 `pnpm vitest run src/renderer/src/components/terminal/use-terminal.test.ts`;Expected: FAIL(exit 1),红因是 `applyTerminalAppearanceToAll` 仍收两参且 `resolveTerminalAppearance` 签名未变。
2. 改 `use-terminal.ts` 与 `TerminalView.tsx`;复跑;Expected: PASS(exit 0),`29 passed`(原 29,删 1 补 1),且不是 0 passed。
3. 改 `App.tsx`(删 matchMedia / systemDark,effect 收口)。
4. 运行 `pnpm typecheck`;Expected: exit 0。
5. 运行 `pnpm test`;Expected: exit 0,全绿。

## 测试规格

### 接缝五 终端接线(抽样档,只验接线不重测解析)

| # | 输入 | 期望 | 期望值来源 |
|---|---|---|---|
| 1 | 两个已开 mock 终端 + 一次 `applyToAll(settings)` | 两实例 options 均被写,字体链/字号来自解析输出;fit 路径触发 | spec 接缝五 |
| 2 | `openTerminal` 设 fontSize=20、fontFamily=JetBrains Mono | 新实例 options 与解析输出一致 | 手算 |
| 3 | 设置改 `terminalTheme` 由 `Ghostty Default Style Dark` → `Tango Dark`,再 `applyToAll` | options.theme 换成 Tango Dark | brief 第 7.1 节验收 2 |
| 4 | 隐藏容器(`display:none`)的终端 | 跳过 fit(既有 S8 守卫不回退) | 终审 P1-2 |

第一版用例 3(systemDark true/false 换槽)删除:维度已不存在,保留即测不存在的行为。
