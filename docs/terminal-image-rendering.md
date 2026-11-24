# 终端内嵌图片渲染 · 技术实现与重加指引

> 2026-11-24 | 状态:**功能已整体移除**(用户决策)——本文存档技术实现,供后续重新添加时照做
> 关联:docs/hook-state-monitoring.md(第四节 pi 节有冻结事故记录)/ Orca 参考实现 `.reference/orca-1.4.265/src/renderer/src/lib/pane-manager/terminal-rendering/`

## 一、移除原因(2026-11-24)

两段独立结论:

1. **pi 集成冻结事故(决定性)**:为让 pi 内嵌渲染图片,spawn env 声明了 `PI_IMAGE_PROTOCOL=kitty`(pi 文档化的能力覆写)。声明后 pi 在恢复会话/渲染含图转录时,向终端发 **kitty 图形分块**(APC 序列 `\x1b_G…`,PNG 载荷 f=100、q=2 静默、4096 字节一片),`@xterm/addon-image` 的 kitty 异步解码处理该序列时把 **xterm 写管线卡死**(实机:pi 冻结在图片位置、无法滚动;其他标签不受影响——独立 xterm 实例)。已回退声明并验证解冻。
2. **裸挂 addon 的能力边界**:Orca 的 kitty 图片渲染依赖一套**支持面机制**,本项目未移植——DA1 所有权(向 CLI 声明 sixel/kitty 能力)、图片落屏后强制重绘(`repaintTerminalAfterImageAdded`)、kitty 文件传输读取器(`readTerminalKittyFile`)。裸挂 addon 只解决「序列来了能画」,不解决「CLI 知不知道该发」和「画完刷不刷」。

用户决策:整体移除(依赖 + 挂载 + 选项接缝),保留本文档。

## 二、依赖与版本配对

```
corepack pnpm add -E @xterm/addon-image@0.10.0-beta.331
```

- `0.10.0-beta.331` = Orca 钉的同版本(package.json:305),与其依赖的 `@xterm/xterm@6.1.0-beta.336`(本项目同款)同代配对,**kitty 图形协议支持在此版本线**(含 wasm 解码,内联在 bundle 中,无外部资产)
- 协议覆盖:SIXEL / iTerm2(OSC 1337)/ Kitty(APC)三协议
- 卸载:`corepack pnpm remove @xterm/addon-image`(注意 `pnpm remove` 不认 `--save-exact`,版本精确性由重装命令的 `-E` 保证)

## 三、选项接缝(内存有界)

新建 `src/renderer/src/components/terminal/terminal-image-options.ts`(+ 同名 .test.ts 钉值):

```ts
import type { IImageAddonOptions } from '@xterm/addon-image'

// 单条编码序列(sixel/iip/kitty)上限:限解码内存/解析工作量,放行正常图片
const IMAGE_SEQUENCE_SIZE_LIMIT = 8 * 1024 * 1024
// 解码存储池上限(MB):解码 RGBA 池而非窗格级总账
const IMAGE_STORAGE_LIMIT_MB = 32

export function buildInlineImageAddonOptions(): IImageAddonOptions {
  return {
    storageLimit: IMAGE_STORAGE_LIMIT_MB,          // 注意:单位 MB(addon 契约),不是字节
    pixelLimit: (IMAGE_STORAGE_LIMIT_MB * 1000000) / 4,
    sixelSizeLimit: IMAGE_SEQUENCE_SIZE_LIMIT,
    iipSizeLimit: IMAGE_SEQUENCE_SIZE_LIMIT,
    kittySizeLimit: IMAGE_SEQUENCE_SIZE_LIMIT
  }
}
```

- **`enableSizeReports` 不覆写**:addon 缺省 `true`,由 addon 自答 CSI 像素尺寸查询;Orca 置 false 仅因其另有自答 responder(双答冲突)。本项目无 responder,缺省即正确
- 测试断言要点:`storageLimit` 断言 **32**(MB 单位,别写 32×1024×1024——踩过)

## 四、挂载点

`use-terminal.ts` 的 `openTerminal()` 内,**Unicode11 块之后**(与 WebglAddon 的 try/catch 形态一致):

```ts
import { ImageAddon } from '@xterm/addon-image'
import { buildInlineImageAddonOptions } from './terminal-image-options'

// 内嵌图片渲染(SIXEL/iTerm2/Kitty;Orca terminal-image-addon-loader 同功能,裁剪懒加载/
// 设置开关/DA1 所有权/kitty 文件读取——单窗口 tab 场景直挂,构造失败 catch 后留在无图行为)
try {
  terminal.loadAddon(new ImageAddon(buildInlineImageAddonOptions()))
} catch {
  // 内嵌图片不可用:终端行为不劣于现状
}
```

## 五、测试模式(vitest,渲染层)

- mock 依赖:`vi.hoisted` 建 `createdImageAddons: Array<{ options: Record<string, unknown> }>` 共享数组 + `vi.mock('@xterm/addon-image', …)` 桩类(构造函数记录 options 并 push)
- 断言:openTerminal 后 `createdImageAddons.length` +1,构造选项各值命中(注意 storageLimit 单位 MB)
- hoisted 的 `createdTerminals` 类型如需扩字段同步补齐(踩过:桩类加了字段、hoisted 类型没加 → TS2339)
- 用例隔离:计数类桩字段跨用例共享会累计——每用例用唯一 sessionId(踩过)

## 六、验证方式

- 自动化:上述选项/挂载用例 + `pnpm typecheck` + 全量 vitest + `pnpm build`(渲染层改动必过 build)
- 手动:装 [chafa](https://hpjansson.org/chafa/) 后 `chafa 图片.png`(SIXEL 路径);或任意 iTerm2 协议输出工具;预期终端内直接渲染,超大图(>8MB)被跳过不炸终端
- 探针形态:`.tmp/hook-probe/pi-img-live.mjs`(node-pty 拉真实 CLI,统计 `\x1b_G` / `\x1b]1337;File=` 头计数)——**注意必须传 `useConptyDll: true`**,否则老 conhost ConPTY 吞 APC 序列,结论全错(踩过)

## 七、pi 集成的完整坑位(重新接 pi 图片前必读)

1. **能力判定是环境变量白名单**:pi `detectCapabilitiesFromEnvironment` 按 `TERM_PROGRAM` 对照具名终端(orca/kitty/wezterm/iterm/ghostty/warp/alacritty…),`soloport` 不在名单 → `images: null` → **pi 根本不发图片序列**(画面干净、无乱码、addon 空等)。Orca 靠 `TERM_PROGRAM=orca + ORCA_IMAGE_PROTOCOL=kitty` 声明
2. **pi 的文档化覆写入口**:`PI_IMAGE_PROTOCOL=kitty|iterm2|none|auto`(env,terminal-setup.md「Override detected capabilities」);settings `terminal.images` 优先级**高于** env
3. **kitty 分块冻结事故(本文第一节)**:声明 kitty 后 pi 发 APC 分块,addon 解码卡死 xterm 写管线。疑点未完全定位((addon kitty handler 的 Promise 未决 / webgl+图片装饰渲染冲突),**重接 pi 图片前必须移植 Orca 的 kitty 支持面**(DA1 所有权 `terminal-protocol/terminal-da1-ownership.ts`、`repaintTerminalAfterImageAdded`、`terminal-kitty-file-reader.ts`)并在应用内加 DBG(receiver/渲染层)定位卡点
4. **替代路径评估**:pi 也支持 `PI_IMAGE_PROTOCOL=iterm2`(OSC 1337,单序列 base64,无分块装配握手)——探针实测 pi 1.6.0 在两种声明下**都未发出图片序列**(live turn 场景;恢复会话回放场景待再验),说明闸门可能不止协议声明——重接前先用探针拿到非零序列证据再动手
5. **诚实边界**:即使 addon 就位,向 pi 声明 kitty 前「我们的终端是否完整支持 kitty 交互路径(查询应答/删除/挂放)」需逐项核对,否则不止不渲染,还可能卡管线
6. **vision 不受影响**:pi read 图片 → 模型看图(走 API)与终端内嵌渲染是两条路,移除本功能后 pi 照样能「看懂」图片,只是不画出来
