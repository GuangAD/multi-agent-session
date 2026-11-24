# 终端 emoji/宽字符宽度错位:含图标行整体左移一格

> 2026-11-23 | 状态:**已修复(待实机目视确认)** | 根因:xterm 内置宽度表只有 Unicode 6(emoji 算 1 格),pi 按 Unicode 9+ 排版(emoji 算 2 格),含 emoji 的行整体左移一格,竖线错位看似断开。修复 = 加载 `@xterm/addon-unicode11` 并激活版本 `'11'`

## 一、现象

pi 会话内渲染带 emoji 的表格(`✅` / `❌`),**含图标的行整体向左缩一个字符**,该行的右边框 `│` 与上下行对不齐,视觉上像框线断开;不含 emoji 的行(纯中文/ASCII)对齐正常。

**用户截图对比**:
- 应用内(错位):`docs/issues/assets/emoji-width-misalign-app.png`
- PowerShell(正常):`docs/issues/assets/emoji-width-misalign-powershell.png`

用户补充判定:**与 WebGL 渲染器无关**(WebGL 只换字形绘制方式,不改宽度表)。

## 二、根因(实测证据)

用 xterm 6.1.0-beta.336 直接测量默认宽度表:

```
默认 unicode.activeVersion = 6
可用版本 = [ '6' ]

✅ U+2705 → 宽度 1
❌ U+274C → 宽度 1
─ U+2500 → 宽度 1
中 U+4E2D → 宽度 2
A        → 宽度 1
```

- xterm 只内置 Unicode 6 宽度表,`✅`(U+2705)、`❌`(U+274C)在该表里是 **宽度 1**(Unicode 6.0 时代它们是 Neutral)。
- 按 Unicode 9.0 起标准,emoji 归入 East Asian Wide = **宽度 2**;pi 排版用新一代 wcwidth,按 2 格计算并把右边框放在第 N 列。
- 渲染时 xterm 只吃掉 1 格 → 该行余下内容与右边框整体左移 1 格 → 竖线错位。

纯中文行不受影响(两种表都是 2 格),所以断口只出现在图标行。

PowerShell(Windows Terminal)无此问题:DirectWrite + 现代 wcwidth,emoji 按 2 格。

**排除项**:
- 与 WebGL addon 无关 —— WebGL 只影响字形绘制(CustomGlyphs 矢量自绘),宽度表由 unicode provider 决定。
- 与 fit/列宽/滚动条无关 —— 那影响整行宽度,不会只让特定行左移 1 格。
- 与 `docs/issues/2026-11-23-box-drawing-seams.md`(亚像素接缝)不同问题:那条是 box-drawing 字形栅格化出缝,本条是字符宽度计算不一致。

## 三、修法(对齐参考实现 Orca)

Orca 装了 `@xterm/addon-unicode11@0.10.0-beta.330`(`.reference/orca-1.4.265/package.json:308`),在 `term.open()` 后加载并激活(`mobile/src/terminal/document/engine/terminal-init.ts:61-67`、`src/main/daemon/emulation/headless-emulator.ts:103-104`)。

本项目落点 `src/renderer/src/components/terminal/use-terminal.ts`:

1. 新增依赖 `@xterm/addon-unicode11`(版本对齐 xterm 6.1.0-beta.336 线,Orca 用 0.10.0-beta.330)
2. `Terminal` 构造加 `allowProposedApi: true`(`unicode` 是 proposed API;实测不加会抛 "You must set the allowProposedApi option to true to use proposed API")
3. `terminal.open()` 后:
   ```ts
   terminal.loadAddon(new Unicode11Addon())
   terminal.unicode.activeVersion = '11'
   ```


**实施记录(2026-11-23)**:
- 依赖:`@xterm/addon-unicode11@0.10.0-beta.330`(与 Orca 同版本线)
- `use-terminal.ts`:Terminal 构造加 `allowProposedApi: true`;`open()` 后 `try { loadAddon(new Unicode11Addon()); unicode.activeVersion = '11' } catch {}`(addon 不可用时保持 Unicode 6,仅 emoji 行可能错位,不回退其他能力)
- 回归用例:`use-terminal.test.ts` 新增「宽字符宽度表(Unicode 11)」,断言 `allowProposedApi === true` 与 `unicode.activeVersion === '11'`;mutation check 通过(把 activeVersion 改回 '6' → 用例转红且红因指向缺陷;还原转绿)
- 端到端探针(真实 xterm + addon):`before ✅=1 ❌=1 中=2 A=1` → `after ✅=2 ❌=2 中=2 A=1`,中文/ASCII 不受影响
- `pnpm typecheck` exit 0;`pnpm test` 31 文件 / 206 用例全绿
- **待用户实机确认**:打开含 `✅`/`❌` 的表格,含图标行右边框应与上下行对齐
**可裁剪**:Orca 额外包了一层 ZWJ provider(`terminal-unicode-provider.ts`,处理 👨‍👩‍👧 类组合 emoji)。本项目单窗口场景可先不做,观察是否出现组合 emoji 错位再补。

## 四、验证方式(修后)

- 单测:`allowProposedApi` 与 `unicode.activeVersion === '11'` 的终态断言(可在 use-terminal.test.ts 的 Terminal 假件上补)
- 实机:渲染同一条带 `✅`/`❌` 的表格,含图标行右边框与上下行对齐;`node -e` 探针确认 `'11'` provider 注册且 `activeVersion === '11'`
- 回归:纯中文/ASCII 行、box-drawing 框线不受影响

## 五、关联

- `docs/issues/2026-11-23-box-drawing-seams.md` —— 已修的亚像素接缝问题(WebGL),与本条独立;用户已确认两者无关
- 本条为待修项,用户当前处于「先记录、逐个修」阶段
