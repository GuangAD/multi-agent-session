# 路径分隔符形态 · 现状、边界与统一方案

> 2026-11-25 | 状态:**讨论已成形,决策待定**(维持平台原生 `\`,还是全仓统一 `/`)
> 来源:路径形态讨论(对应 `TODO.md` 第四节「待讨论(架构疑点):项目路径统一形态,反斜杠还是正斜杠」)
> 关联:ADR-0003(应用永不改写 agent 存储)、`TODO.md` D9(pi 桶名在非 Windows 平台的编码规则未实测)

**怎么读这篇**:先看第一节(结论)与第五节(两条路线);第二至四节是事实清单与实测证据,第六节是已知坑与验证项,第七节是同期发现、不属本议题的登记项。选定一条路线照做即可。

---

## 一、结论先行

1. **今天没有功能性缺陷。** 现有设计是「**存储用平台原生形态(Windows 上 `\`),凡要对外或要比较的一律先归一到 `/`**」,在 Windows 与 macOS/Linux 上各自自洽。
2. 因此「统一 `/`」不是修 bug,是**风格与一致性决策**,收益是「应用存储的路径」与「第三方递进来的路径」同形态;成本是 7 处改动 + 一次数据形态变更。
3. 两条路线各自的完整清单在第四、五节。**只能选一条**,不要把「先切形态、后兜旧数据」的顺序做反(见第五节顺序约束)。
4. 本节讨论**不解决也不加重 D9**:pi 的桶名编码规则在非 Windows 平台仍须实测,与存储形态无关。

---

## 二、范围:只谈这三类路径

讨论开始时容易发散到「全仓所有路径」,实际有影响面的只有三类:

| 类型 | 判定 | 涉及 |
|---|---|---|
| **持久化** | 会写进 `store.json` 的值 | `projects[].path`、`sessions[].externalFilePath` |
| **比较/缓存键** | 被用作相等比较或 `Map` 键 | 项目去重、导入匹配、git 句柄缓存 |
| **跨进程传递** | 经 IPC 在渲染层与主进程间往返 | 文件树、Git 面板、外部编辑器打开 |

**不在范围内**:`__dirname` 拼资源、`node_modules` 定位、agent 存储根目录(`~/.claude/projects` 等)这类一次性内部路径 —— 从不落盘、不比较、不进 IPC 载荷。统一它们零功能收益,只增加回归面。

---

## 三、今天的事实清单(全部可定位)

### 3.1 仅有一个地方把路径变成 `\`

`src/main/ipc/projects.ts:12`

```ts
function normalizeProjectPath(raw: string): string {
  const normalized = normalize(raw)                    // ← node:path.normalize,Windows 上输出 \
  if (normalized.length > 3 && normalized.endsWith(sep)) {
    return normalized.slice(0, -1)                     // 去尾分隔符;盘根 D:\ 保留
  }
  return normalized
}
```

调用点只有一处:`projects.ts:37`(用户选完目录入库前)。项目名取 `basename(path)`(`:42`)。

**注意**:`normalizeProjectPath` 与 `isSameProjectPath`(`:21`)都是该文件的私有函数,而该文件 `import { dialog, ipcMain } from 'electron'` → vitest 无法 import → **这两个函数今天零测试覆盖**。

### 3.2 主动把 `\` 转成 `/` 的代码:共 3 处

| 位置 | 代码 | 作用 |
|---|---|---|
| `session-import/runtime-path-separators.ts:13` | `value.includes('\\') ? value.replace(/\\/g, '/') : value` | 通用归一:反斜杠转正斜杠、压重复斜杠、保留 UNC 前缀 `//` |
| `agent-hooks/injector.ts:74` | `join(scriptsDir, 'soloport-hook.cmd').replace(/\\/g, '/')` | launcher 脚本路径转 `/`,准备写进 hook 配置 |
| `agent-hooks/forwarder-script.ts:69` | `` `${launcherPath.replace(/\\/g, '/')} --agent ${agent} …` `` | 拼 hook 命令串时再转一次(与上一处幂等冗余) |

第 1 处的使用者只有两个:

- `claude/claude-project-dir-encoding.ts:21` —— 算 claude 会话桶名(先 `/` 再编码)
- `session-import/path-match.ts:10` —— 项目匹配的比较键(先 `/` 再比)

第 2、3 处是同一个值转两次(幂等),说明写时不确定上游形态 —— 这本身就是「缺一条显式契约」的证据。

### 3.3 看起来像转换、实际不是的 4 处

| 位置 | 代码 | 实际作用 |
|---|---|---|
| `pi/scan.ts:55` | `trimmed.replace(/[:\\]/g, '-')` | 把 `\` 与 `:` 换成 `-`,算 pi 桶名,不产生 `/` |
| `git-service.ts:45` | `path.slice(1,-1).replace(/\\(["\\])/g, '$1')` | 还原 git 的 C 风格转义,与分隔符无关 |
| `codex/codex-rollout-files.ts:21`、`FilePreview.tsx:46`、`file-preview-slice.ts:38` | `split(/[\\/]/)` | 从路径取文件名,两种斜杠容错,不改写 |
| `runtime-path-separators.ts:7` | `isWindowsAbsolutePathLike` | 仅判断,不改写 |

### 3.4 反向 `/` → `\`:手写代码 0 处,隐式发生在标准库

- `ipc/projects.ts:12` `normalize(raw)`
- `fs-tree.ts:54` `join(root, entry.name)`(主进程域(含 shared/preload)`join` 调用点共 65 处,原理相同)

这些只在 Windows 上输出 `\`;macOS/Linux 输出 `/`。

### 3.5 五类「形态变更会出错」的用法(排查框架)

| 用法 | 具体位置 | 形态变更后会发生什么 |
|---|---|---|
| 编码/拼名字 | `pi/scan.ts:52` `piBucketName` | 桶名不同 → 扫描静默为空 |
| 相等比较 | `ipc/projects.ts:38` `isSameProjectPath` | 同一目录被判成两个项目 |
| 缓存键 | `git-service.ts:173` `repos.get(root)` | 同一仓库两个 git 句柄 → 撞 `.git/index.lock` |
| OS/第三方边界 | `open-in-editor.ts:49` `shell.openPath`、`pty-registry.ts:332` `cwd` | 是否接受 `/` 需实测 |
| 已落盘数据 | `store.json` 中 `\` 形态的老值 | 新旧形态并存 |

---

## 四、平台事实(本机实测)

```
fs.existsSync('D:/test/agent-sessions/package.json')        → true
fs.readdirSync('D:/test')                                   → 33 项
fs.realpathSync('D:/test') === fs.realpathSync('D:\\test')  → true

子进程以 cwd = 'D:/test/agent-sessions' 启动
  → 其 process.cwd() 返回 "D:\\test\\agent-sessions"

cmd /d /s /c "cd /d D:/test/agent-sessions && cd"
  → 提示符显示 D:\test\agent-sessions
```

三点结论:

1. **Windows 两种都接受**,但会**自己归一成 `\`** 再回给你(`process.cwd()`、`realpath`、shell 提示符均如此)。
2. **POSIX 只接受 `/`**;`\` 在 macOS/Linux 上是**合法文件名字符**,`path.posix.basename('D:\work\demo')` 返回整串,`fs.existsSync` 返回 false —— 不报错、只是「不存在」。
3. 所以 `/` 是三平台唯一公共子集;`\` 是 Windows 单平台写法。

**关键判断**:若「不同平台各自打包、数据不互通」(已确认的前提),则两条路线在各自平台上**都自洽**,不存在技术必需 —— 这是把本议题定性为「风格决策」的依据。

**若未来数据要互通**(同一份 `store.json` 跨平台),则只有 `/` 可行:存 `\` 的值在 POSIX 上整份失效。

---

## 五、两条路线的完整清单

### 5.1 路线 A:维持平台原生 `\`(零代码改动)

需要**显式化三条今天靠记忆维持的隐含契约**,否则后续接入必踩:

1. **新的 cwd 来源必须经 `matchProjectDir` 比较**,禁止 `cwd === project.path`。
   依据:`antigravity/scan.ts:339` 的 `fileURLToPath(url, { windows: true })` 产出的就是 `\` 形态;今天安全仅因为 `session-import/index.ts:63` 统一调用 `matchProjectDir`(它先归一再比)。
2. **`fs-tree` 输出的 `path` 只保证是合法路径,不保证斜杠风格统一**。
   依据:`fs-tree.ts:54` 的 `join` 在 Windows 上会把整串转成 `\`,而根节点 `path: root`(`:32`)保留传入形态 —— 同一棵树里可能两种风格并存。渲染层没有任何前缀比较,因此当前无影响。
3. **存储形态由 `path.normalize` 决定**,任何新增落盘字段都必须接受这一形态。

建议落点:`AGENTS.md` 工程边界一条,或本文件第七节升级为正式约定。

### 5.2 路线 B:统一 `/`(7 步,含一次数据形态变更)

| 序 | 改什么 | 位置 |
|---|---|---|
| 1 | 抽纯模块:归一 + 比较 + `joinPath` + 单测(**行为不变**) | 新建 `src/main/session-store/project-path.ts`;`ipc/projects.ts:12/21` 改为调用它 |
| 2 | `loadStore` 把老数据归一到 `/`;`writeStoreAtomically` 加开发期断言(store 中残留 `\` 即报错) | `store-persistence.ts:108`、`:173` |
| 3 | 归一算法切换为输出 `/` | 第 1 步的模块 |
| 4 | `fs-tree` 输出归一(根 + 子项统一 `/`) | `fs-tree.ts:32/54` |
| 5 | 五家 scanner 的 `cwd` / `filePath` 出口归一 | `agents/plugins/{claude,codex,kimi,pi,antigravity}/scan.ts` |
| 6 | pi 桶名字符类补 `/` + 补正斜杠形态夹具 | `pi/scan.ts:52`、`pi.test.ts:84/93` |
| 7 | 会落盘或跨进程的路径拼接改用 `joinPath`(不用 `path.join`) | 主进程域 65 处 `join`(计数见 3.4)中筛「产出会落盘/进 IPC」的那些 |

**顺序约束(必须遵守)**:第 2 步严格早于第 3 步。若先切写入端形态,切完当天磁盘上 `\`(老)与 `/`(新)并存 → 侧栏出现重复项目 + 同一仓库两个 git 句柄撞 `index.lock`。

**两处待裁决边界**:

- **边界 A**:纯内部一次性路径(`__dirname` 拼资源等)是否也纳入。建议**不纳入**,理由见第二节。
- **边界 B**:`sessions[].externalFilePath` 是否纳入。它是我们落盘的字段,按规则应纳入;且零风险(见 6.3)。

### 5.3 `joinPath` 的实现要点(路线 B 的关键坑)

`path.win32.join` 不只是插分隔符,它内部会 `normalize`,**把整串统一成 `\`**(实测 `join('D:/work/demo','package.json')` → `'D:\work\demo\package.json'`)。所以路线 B 下「内部拼路径」不能再直接用 `path.join`。

同时**不能用 `path.posix.join` 代替**,它会毁掉 UNC 前缀:

```
path.posix.join('//srv/share', 'x')   →  '/srv/share/x'    (双斜杠被压成一个,网络共享路径失效)
```

正确做法:先经 `normalizeRuntimePathSeparators`(已保留 UNC 前缀)→ 去尾 `/` → 用 `/` 拼接 → 再保护一次 UNC 前缀。单测四种形态:普通路径、盘根 `D:/`、UNC `//srv/share`、尾分隔符。

---

## 六、已知坑与验证项

### 6.1 `shell.openPath` 需要实机验一次(两条路线都需要)

`open-in-editor.ts:43` 的 `openInEditor`:先试 `code`(经 `cmd /d /s /c` 包装,路径不以 `/` 开头,不会触发 cmd 的开关语义),失败则回退 `shell.openPath(target)`(`:49`)。后者把字符串直接交给 `ShellExecuteW`,反斜杠 100% 可用,正斜杠「通常」可用但无文档保证。

冒烟法:临时禁用 `code`,点一次「用外部程序打开」。

### 6.2 pi 桶名:路线 B 下字符类补 `/`,但 T7 的 9 桶核对**不用重做**

`pi/scan.ts:52` 的字符类是 `[:\\]`,转为 `/` 形态后需补成 `[:\\/]`;输出字符串不变(`--D--工作区-alpha-app--`),所以历史核对结论继续有效。

另一条独立结论:即使终端 `cwd` 传 `/`,pi 进程内 `process.cwd()` 由 OS 归一回 `\`(见第四节实测),所以桶名编码结果不变。

### 6.3 `sessions[].externalFilePath` 是死代码(证据链完整)

- 定义:`shared/types.ts:26`,注释「pi 等按转录路径续接的 agent 需要」
- 写入点仅两个,且都在 `externalSessionId` 之后:`session-import/index.ts:103-105`、`ipc/pty.ts:99-101`
- 消费点仅一个:`pi/plugin.ts:49-50` 的降级分支 `ref.id ? ... : ref.filePath ? ... : null`
- `git log -S externalFilePath` 显示自 T6(`7b8a8aa5`)引入即为上述写法,**历史上不存在「有 filePath 无 id」的写入路径**

结论:该降级分支不可达,字段本身冗余。清理属独立事项(动 `shared/types.ts` + `shared/agents.ts` `ResumeRef.filePath` + 3 处),不要与本议题的形态变更捆绑 —— **已于 2026-11-26 清理完毕(commit `98f493cb`),本节保留为历史证据。**

### 6.4 测试夹具缺口(路线 B 必须补)

`pi.test.ts:84/93` 以 `'D:\\work\\alpha'` 形态调用 `scanPi`。路线 B 后真实输入是 `/` 形态;若夹具不加该形态,正斜杠分支写错也全绿(假绿)。`claude.test.ts` 需确认是否已覆盖两种形态(claude 编码函数本就先归一,可能已有)。

### 6.5 冒烟清单(路线 B)

`openPath` 回退、shell 提示符显示形态、pi 导入(桶名命中)、Git 面板状态/暂存/提交、文件树展开、四家导入、hook 注入与 `hooks.remove()`。回归基线:`pnpm typecheck` 双投影 + `pnpm test` 全绿。

---

## 七、登记备查(不属本议题)

- ~~**`DECISIONS.md` 存在两条编号相同的 `J-003`**~~ 已于 2026-11-26 修复:后一条(第三方上游缺陷照搬 Orca 补丁重放)改号为 `J-006`,判断内容未改。
- ~~**`externalFilePath` 死代码**~~ 已于 2026-11-26 清理(commit `98f493cb`),证据链见 6.3。
- **D9(pi 桶名非 Windows 平台编码)**:与本议题无关,仍待实测。若出 macOS/Linux 版,需先确认 pi 在对应平台的桶名编码规则再补 `piBucketName`。

---

## 八、待裁决项

- [ ] **决策一**:存储形态走路线 A(平台原生 `\`)还是路线 B(统一 `/`)
- [ ] **决策二**(仅路线 B):界面显示是否在 Windows 上转回 `\` 观感(建议转,存储与显示各管一层)
- [ ] **决策三**(仅路线 B):边界 A —— 纯内部一次性路径是否也纳入统一
- [ ] 决定后:把结论落到 `AGENTS.md` 一条显式约定,防止后续贡献者重复困惑

## 九、决策记录

(待填。格式沿用 `DECISIONS.md`:状态 / 日期 / 来源 / 判断 / 波及)
