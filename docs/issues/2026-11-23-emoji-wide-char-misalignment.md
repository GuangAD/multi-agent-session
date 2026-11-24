# 终端 emoji/宽字符宽度错位:含图标行整体左移一格

> 2026-11-23(一轮)/ 2026-11-24(二轮) | 状态:**已修复(二轮待实机目视确认)** | 根因两轮:①xterm 内置宽度表只有 Unicode 6(✅/❌ 算 1 格),pi 按 Unicode 9+ 排版算 2 格,含 emoji 行整体左移一格 → 加载 `@xterm/addon-unicode11` 激活 `'11'`。②残留的滚动条竖线左移 = pi 按 RGI emoji 把「窄基码+VS16」序列(`➡️` `↗️` 等)计 2 格,而 `'11'` 基表按单个码点查 EAW 仍算 1 格 → 移植 Orca unicode provider(`charProperties` 序列感知)并加 VS16 规则,详见第六节

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
**可裁剪(2026-11-24 已落地)**:Orca 额外包了一层 ZWJ provider(`terminal-unicode-provider.ts`,处理 👨‍👩‍👧 类组合 emoji)——已随二次修复一并移植,见第六节。

## 四、验证方式(修后)

- 单测:`allowProposedApi` 与 `unicode.activeVersion === '11'` 的终态断言(可在 use-terminal.test.ts 的 Terminal 假件上补)
- 实机:渲染同一条带 `✅`/`❌` 的表格,含图标行右边框与上下行对齐;`node -e` 探针确认 `'11'` provider 注册且 `activeVersion === '11'`
- 回归:纯中文/ASCII 行、box-drawing 框线不受影响

## 五、关联

- `docs/issues/2026-11-23-box-drawing-seams.md` —— 已修的亚像素接缝问题(WebGL),与本条独立;用户已确认两者无关
- 本条为待修项,用户当前处于「先记录、逐个修」阶段

## 六、二次根因与修复:滚动条竖线左移一格(2026-11-24)

**现象**:一轮修复后 `✅`/`❌` 行已对齐,但 pi 行尾自绘的滚动条竖线仍向左跳动——含 `➡️` 的行(grilling 推荐行,截图中呈 `■` tofu 字形)竖线比普通行左移一格,滚动时两类行交替进入视口即「跳动」。用户问「unicode 占位已处理为何还错」。

**根因(实测,链路闭环)**:两边宽度口径在「文本默认 emoji + VS16」序列上不一致——
- pi(bundle `chunk-X26YOAEH.js` 的 `clusterWidth`):`couldBeEmoji && rgiEmojiRegex` 命中 RGI emoji 序列一律计 2 格;`➡️`(U+27A1+FE0F)、`↗️`(U+2197+FE0F)、`✔️`、`⚠️` 都属此类;来源:grilling 技能文件推荐行标记 `➡️`(`D:\test\pi-workflow\devflow\skills\grilling\SKILL.md:27`)、pi MCP 扩展状态文本 `↗️`。
- xterm(unicode11 `'11'` 基表):按单个码点查 EAW。U+27A1/U+2197 非 East Asian Wide(模糊宽),`BMP_WIDE` 表没有它们;基表 `charProperties` 让 VS16 零宽 join 进前格 → 整序列消费 1 格。
- 真实 xterm headless 探针:`ab➡️c` cursorX=4(序列 1 格),pi 排版要 5(2 格)→ pi 把内容与行尾滚动条 `┃` 拼进同一行靠字符流推进列位置,行内每差一格滚动条左移一格。
- 结论:**按码点的宽度表永远对不上 pi 的 RGI 序列口径**,unicode11 无法修复此类。

**修复(移植 Orca 方案 + 本项目增量)**:新增 `src/renderer/src/components/terminal/terminal-unicode-provider.ts`
- Ported from stablyai/orca `src/shared/terminal/appearance/terminal-unicode-provider.ts`(MIT):用 xterm 序列感知 API `charProperties(codepoint, preceding)` 包一层 Unicode11 基表——ZWJ 组合 emoji 各成员 join 进首格,整序列 2 格(原「可裁剪」项一并落地)。
- 本项目增量(Orca 原版无):VS16 在 precedingWidth===1 时自占 1 格不 join → 「窄基码+VS16」序列共 2 格;宽格 emoji(`✅️`)不受影响仍走基表 join。裸 `➡`(无 VS16,pi 计 1)不受影响——门槛天然排除。
- `use-terminal.ts`:`loadAddon(new Unicode11Addon())` 后改调 `activateRgiUnicodeProvider(terminal)`(版本号 `'11-rgi'`);缺 `'11'` 基表时退回 `'11'`,不回退其他能力。

**验证(2026-11-24)**:
- 真实 xterm headless 探针(6 例全对齐 pi 口径):`ab➡️c`=5、裸 `➡`=4、`ab✅c`=5、`ab中c`=5、ZWJ `🧑‍🚀b`=4、宽 emoji+VS16 `🔴️b`=4
- 单测:新增 `terminal-unicode-provider.test.ts`(VS16 窄/宽门槛、ZWJ、透传、激活/幂等/降级 6 例,期望值注明探针来源);`use-terminal.test.ts` 桩扩展 `unicode.register`/`versions`/`_core`,激活断言改 `'11-rgi'`
- mutation check:临时失效 VS16 规则 → 钉住用例转红且红因正指 join 位;还原转绿
- `pnpm typecheck` exit 0;`pnpm test` 37 文件 / 256 用例全绿
- **待用户实机确认**:grilling 会话里含 `➡️` 的推荐行,行尾滚动条竖线应与上下行对齐,不再左移跳动
