# 终端 xterm addon 对照审计(对照参考实现 Orca)

> 2026-11-23 | 状态:**审计完成;发现的 1 个真实隐患(WebGL context loss 无回退)已修复**;其余为能力缺口非缺陷

## 一、依赖对照

| 包 | 本项目 | Orca | Orca 用途 | 我们是否需要 |
|---|---|---|---|---|
| `@xterm/xterm` | 6.1.0-beta.336 | 6.1.0-beta.336 | 终端内核 | 同一版本线 |
| `@xterm/addon-fit` | 0.12.0-beta.332 | 0.12.0-beta.332 | 尺寸提案 | 已用(`StableCellFitAddon extends FitAddon`) |
| `@xterm/addon-webgl` | 0.20.0-beta.329 | 0.20.0-beta.329 | 字形矢量自绘(box-drawing 接缝) | 已用,**但缺 context loss 回退,见第二节** |
| `@xterm/addon-unicode11` | 0.10.0-beta.330(本次新增) | 0.10.0-beta.330 | 宽字符宽度表 | 已用(emoji 宽度错位修复) |
| `@xterm/addon-search` | 未装 | 0.17.0-beta.330 | 终端内查找(`terminal-pane/search/`) | 能力缺口,非缺陷 |
| `@xterm/addon-web-links` | 未装 | 0.13.0-beta.330 | 终端内 URL 可点击(`standalone-terminal/rendering/preview-terminal-links.ts`) | 能力缺口,非缺陷 |
| `@xterm/addon-ligatures` | 未装 | 0.11.0-beta.330 | 编程连字(仅 Orca 的 standalone 预览用) | 不需要(渲染风格选择,且与 WebGL 渲染器不叠加) |
| `@xterm/addon-image` | 未装 | 0.10.0-beta.331 | 终端内联图片(`pane-inline-images.ts`,iTerm2/sixel 协议) | 暂不需要(agent 输出不产图;将来截图类能力再评估) |
| `@xterm/addon-serialize` | 未装 | 0.15.0-beta.330 | 串行化缓冲区(daemon 重放/恢复) | 不需要(本项目不持久化终端画面,ADR-0002/0003 口径) |
| `@xterm/headless` | 未装 | 6.1.0-beta.334 | 主进程无头模拟器(状态识别在 daemon 内跑) | 不需要(我们的状态识别已由渲染层快照 + 主进程字节流承担) |

结论:Orca 的 10 个 xterm 包中,我们真正需要且已对齐的是 xterm 内核 / fit / webgl / unicode11 四个;其余 6 个是它自身架构与功能面(daemon 重放、内联图片、终端内查找与链接、standalone 预览连字)带出来的,不属于本项目的缺陷。

## 二、发现的真实隐患:WebGL context loss 无回退

**位置**:`src/renderer/src/components/terminal/use-terminal.ts`(WebGL addon 加载处)

**现状**:代码只做 `try { terminal.loadAddon(new WebglAddon()) } catch {}`,并有一条注释断言「context loss 由 addon 自 dispose 回退 DOM」。

**实测该断言不成立**(读 `@xterm/addon-webgl@0.20.0-beta.329` 源码):
- 收到 `webglcontextlost` 时 addon 只 `preventDefault()` 并起 3 秒计时器;
- 3 秒内没等到 `webglcontextrestored`,仅 **fire `onContextLoss` 事件**,**不会自己 dispose**;
- 回退到 DOM renderer 的动作在 addon 的 dispose 回调里(`setRenderer(_core._createRenderer())`)。

**后果**:GPU 上下文丢失(显卡驱动重置、远程桌面/虚拟机切换、休眠唤醒)且未订阅 `onContextLoss` 时,终端停留在已失效的 WebGL 渲染器上——**画面空白或冻结且永不恢复**,必须关掉标签页重开。

**Orca 的做法**(`src/renderer/src/lib/pane-manager/terminal-rendering/pane-webgl-renderer.ts:260`):订阅 `addon.onContextLoss(...)` → 标记该 pane 禁用 WebGL → `disposeWebgl(pane, { refreshDimensions: true })`,即主动 dispose 让 xterm 回退 DOM 并按尺寸重排。

**建议修法(最小)**:
```ts
const webglAddon = new WebglAddon()
webglAddon.onContextLoss(() => {
  webglAddon.dispose() // dispose 内部 setRenderer(默认 DOM),xterm 自动回退
})
terminal.loadAddon(webglAddon)
```
配合把注释里「addon 自 dispose」的错误说法改掉。验证需模拟 context loss(`WEBGL_lose_context` 扩展)观察是否回退 DOM 且画面恢复。

**证据强度**:源码级确认(addon 二进制源码片段 + Orca 实现对照);未做运行时验证(需 dev 环境用 `gl.getExtension('WEBGL_lose_context').loseContext()` 注入)。

**实施记录(2026-11-23,已修)**:
- `use-terminal.ts`:WebGL addon 改为 `const webglAddon = new WebglAddon(); webglAddon.onContextLoss(() => webglAddon.dispose()); terminal.loadAddon(webglAddon)`,并把「addon 自 dispose」的错误注释改写为源码事实
- 回归用例:`use-terminal.test.ts` 新增「WebGL context loss 回退」(mock addon 记录订阅与 dispose),断言订阅数 1、触发后 disposed=true;mutation check 通过(去掉 dispose → 用例转红且红因指向缺陷,还原转绿)
- `pnpm typecheck` exit 0;`pnpm test` 204/207 通过——失败的 3 条是 `pty-registry.kill-tree.test.ts`(真实 ConPTY 台架需要 `tasklist` 枚举进程),本沙箱 `tasklist` 返回「拒绝访问」,**环境不可达,与本次改动无关(改动仅在渲染层)**,需在非沙箱环境或本机终端复跑
- **待运行时确认**:注入 `WEBGL_lose_context` 后终端应回退 DOM renderer 并继续绘制,而非白屏

## 三、其他观察(非缺陷)

- `allowProposedApi: true` 本次因 unicode11 而开启。它使 proposed API 可用(目前仅 unicode 用到),属与 Orca 相同取舍;副作用是未来 xterm 小版本可能改动这些 API,升级时需留意。
- 我们的 fit 走自研 `StableCellFitAddon`(避开官方 `css.cell` 随列数漂移),而非直接 `addon-fit.fit()`,与 Orca 的取舍一致。
- 状态识别不依赖渲染器:`serializeVisibleLines` 读 `terminal.buffer.active`,DOM/WebGL 两种渲染器下一致。

## 四、待用户决定

1. 是否现在修第二节的 WebGL context loss 回退(改动约 5 行 + 一条运行时验证)。
2. 能力缺口(search / web-links)是否列入后续功能需求——它们不是 bug,属新功能。
