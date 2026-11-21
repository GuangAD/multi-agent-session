# Agent Sessions

轻量桌面应用:以目录为单位管理项目,每个项目下新建会话(在终端运行第三方 agent CLI),支持导入 agent 历史会话、文件浏览与 Git 面板。唯一执行计划见 `PLAN.md`(含里程碑 M1–M7 与 Orca 借鉴清单附录),按里程碑推进。

## 技术栈

Electron + electron-vite + TypeScript strict;React 19 + Zustand + Tailwind CSS 4;node-pty + @xterm/xterm;simple-git;vitest。

## 常用命令

- 开发:`pnpm dev`(首装 `pnpm install`;node-pty 编译需 VS Build Tools + Python 3)
- 类型检查:`pnpm typecheck`(node + web 两投影)
- 测试:`pnpm test`(仅纯逻辑:持久化、探测、解析、扫描;fixture 回放防回归)
- 打包:`pnpm build`(M7 起接 electron-builder)

## 工程边界

- `src/main/`:全部 Node 能力(fs/pty/git)唯一所在地,按领域分目录
- `src/preload/`:contextBridge 唯一桥
- `src/shared/`:进程间契约,渲染层唯一类型来源
- `src/renderer/`:纯 UI,永不 import main,一切经 `ipc/bridge.ts`
- `.reference/`:Orca v1.4.265 完整源码快照,只读参考(移植时按附录 A 取用),永不 import、不构建;2026-11-20 起随仓库入库(348MB／38043 文件)以支持换机续做
- agent 扩展点:接入新 agent CLI = 仅在 `src/main/agents/definitions/` 新增一个定义文件,框架零改动
- 目录名用具体领域名,不设 utils/helpers/common;单测与源码同目录 `*.test.ts`
- 终端外观配置:字体族/字号/字重必须作为 xterm options 的单一来源,不得只改 CSS;度量类配置变更后对所有终端 refit 并同步 PTY 网格,颜色类可运行时更新不 refit;详见 `docs/issues/2026-11-21-terminal-rendering.md` 第七节

## 执行纪律

- 按 PLAN.md 里程碑推进;每个里程碑 `tsc --noEmit` + vitest + 手动冒烟通过后,经用户确认再 commit
- commit 信息中文,前缀 feat:/fix:/refactor:/docs:/chore:,说明改了什么与原因
- 不为浅覆盖加测试;状态解析器与会话扫描器用 fixture 回放(正/反样本)防回归
- 移植 Orca 代码时文件头标注来源(`// Ported from stablyai/orca <path>`,MIT),保留 `// Why:` 注释

## 红线

- 不推送远端、不发布,除非用户明确要求
- M3 若走 hook 注入路线,注入的 hook 配置须随会话清理
