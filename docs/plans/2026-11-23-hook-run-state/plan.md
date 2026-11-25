# Hook 驱动的运行状态识别 · 切片

> 2026-11-23 | 状态:T1–T4 完成(2026-11-24 随 0d8289fb 入库);T5 剩实机冒烟(验项 H1–H5 已转 TODO.md 跟踪,正典清单在 docs/pending-verification.md 四),过即门 3

## 任务

- [x] **T1 hook 状态引擎与事件契约**
      交付:AgentStateRules 重构(hooks 事件映射,旧字段删除)+ hook-tracker 接缝与事件序列 fixture 回放(五家正/反样本)+ 五插件 state 段改写;state-parser.ts 与读屏 fixture 删除(ipc/state 暂以适配层喂 hook tracker,保编译绿)
      挡谁:T2、T3、T4
- [x] **T2 接收器与路由编排**
      交付:loopback receiver(端口/token/路由纯接缝)+ forwarder 脚本生成与落盘 + ipc/state 重写(receiver→tracker)+ pty spawn env 注入;env 继承探针(claude/pi 本机实测,记录结论)
      挡谁:T3、T5
- [x] **T3 注入器与五家配置合并**
      交付:三个 merge 接缝(claude-settings / hooks-json / kimi-toml marker,用户内容逐字节保留硬断言)+ injector(启动 reconcile / 项目添加补写 / spawn 前校验 / 显式移除 seam + IPC)+ 项目删除联动清理 + pi 扩展模板写盘
      挡谁:T4、T5
- [x] **T4 三源退役清理**
      交付:use-terminal 删快照节流与标题上行;契约/preload 删 state:title / state:snapshot;渲染层相关测试用例清理;全量 typecheck + vitest + build 绿
      挡谁:T5
- [ ] **T5 实机冒烟与文档收尾**
      交付:claude/pi 本机五环冒烟(brief 7.1);ADR-0007(取代 0001)落盘;issue 文档 Bug 1/2 处置改写、Bug 3 指向独立修复;CONTEXT.md 词条补 hooks 路由;未装三家记录装后复核项
      挡谁:无

## 依赖

T1 → T2 → T3 → T4 → T5,严格串行(引擎接缝是全部后续的地基;注入依赖脚本生成;清理依赖契约改写;冒烟依赖全链)。

## 遗留项

- claude `Notification` 事件覆盖面实机校准(可能从 waiting 槽收窄)→ T5
- codex / kimi / antigravity 本机未装:注入、事件、env 继承、信任门槛全部装后复核 → pending-verification.md(T5 挂)
- 显式移除的 UI 入口位置(授权项)→ seam 与 IPC 在 T3 落全,入口随实现按现有 UI 惯例定,冒烟可用 store/IPC 直调代替
- Bug 3(fit 可见性守卫)已由主题特性终审 P1-2 修复(2026-11-24:openTerminal 首帧隐藏守卫 + readyFired 补发;冒烟项 R26 通过),不在本特性

## 开发记录

- 开工前接口预检 | 通过(2026-11-23)
  - T1→T2:hook-tracker.onHookEvent/onExit 形状与 ipc/state 编排消费一致;AgentStateRules 重构后五插件同步改写,测试夹具(agent-list.test / kill-tree.test / agents-slice.test)state 字段同步
  - T2→T3:forwarder 脚本与 launcher 落盘函数(T2 产)由 injector(T3)消费;merge 认领键 = 脚本文件名稳定子串(评审定案)
- T1 hook 状态引擎与事件契约 | 完成(2026-11-23)
  - 交付:AgentStateRules 重构(hooks 三槽,degraded/title/screen/bytes/idleQuietMs 删除);hook-tracker 接缝(事实直落 + 同态幂等 + seed idle + exited 终态);五插件 state 段改写;kimi 退役降级档;ipc/state 最小适配(title/snapshot handler 留壳);state-parser 与读屏 fixture 删除(git rm,契约明列)
  - 评审引入(Orca 参照,用户问「可否参考 Orca 状态流转」后核对源码):PostToolUseFailure 补进 claude/kimi working 槽(拒绝/失败路径回 working;Orca stateBeforeWait 恢复语义同构验证);其余 Orca 复杂度(子代理折叠/终端输入推断打断/传输健康)不采纳——产品面不具备或与「不猜」原则相悖
  - 验证:typecheck 双投影 exit 0;vitest 201 passed / 31 files(基线 205 − 读屏 15 + hook 回放 11,自洽)
  - 口径:engine 无时钟依赖(opts.now 不需要,契约伪代码偏差,登记)
- T2 接收器与路由编排 | 完成(2026-11-23)
  - 交付:receiver(listen(0) 随机端口 + token 校验 + resolveHookTarget 纯接缝 + 64KB 上限)+ forwarder 脚本/launcher 生成与落盘函数 + ipc/state 接线(receiver→trackerForHook)+ ipc/pty env 注入三令牌 + pty-registry hookEnv 段
  - **env 继承探针(契约第一验证项)实机 PASS**:临时件 .tmp/hook-probe/,claude 2.1.220 全链验证——env 注入→claude→hook 脚本继承分毫不差;stdin 载荷 337 字节含 hook_event_name;POST 204。探针过程中三项实证修正:①hook 命令形态 = 裸路径+正斜杠+无引号+无空格(指向 soloport-hook.cmd launcher,内部引号承载 node 路径);cbm 双引号形态不触发;②buildHookCommand 契约签名改为 (launcherPath, agent, event);③信任门槛实测:未信任目录 -p 不触发 hooks,交互模式首会话由 claude 弹框
  - 探针方法论留痕:spawnSync 会阻塞探针自身事件循环造成「接收超时」假象(生产 Electron 异步无此问题);cmd 数字紧贴 >> 被当句柄重定向的经典陷阱干扰过一次日志判读
  - 验证:typecheck 双投影 exit 0;vitest 212 passed / 33 files(201 + forwarder 7 + receiver 4)
  - TDD waiver:receiver 服务器编排(import http)无单测——关键判定已抽 resolveHookTarget 全测,行为靠 T5 实机五环(沿 T5/T8 编排层先例)
- T3 注入器与五家配置合并 | 完成(2026-11-24)
  - 交付:三 merge 接缝(claude-style-hooks〔claude/codex 同构共用〕/ antigravity-hooks〔hook 名映射,工具事件带 matcher〕/ kimi-toml〔marker 块,Orca 方案裁剪移植〕)+ 注入器(reconcile/ensureProject/removeProject/removeAll,kind 按 def.hooks 声明分发)+ pi 扩展模板(事件清单由插件 state.hooks 并集生成,模板对集合泛化)+ IPC 接线(hooks:remove + preload + 项目增删联动 + spawn 前自愈)
  - 口径裁决登记:①JSON 类(claude/codex/antigravity)走「语义保留」(parse 后 deep-equal,重序列化不改键值),kimi TOML 走「字节保留」(marker 区间外逐字节不动)——JSON 无文本保真,如实区分;②antigravity 认领键 = 固定 hook 名 'soloport-state'(名字认领);③claude/codex 认领键 = launcher 文件名稳定子串
  - 过程缺陷两处(测试先行抓到):stripClaimed 对不存在事件键返回 undefined 被展开;kimi 重建路径少Eat自己写的尾换行 → 反复 apply 渐增空行。均修复并由用例钉住
  - mutation check ×2 留痕:A 认领条件改宽为全删 → 用例 2/3 精确转红(用户保留+幂等)→ 还原绿;B kimi remove 失效 → 用例 10 转红 → 还原绿。注:mutation 期间曾误用 git checkout 还原未跟踪文件失败,改手动还原(工具边界登记)
  - 验证:typecheck exit 0;vitest 230 passed / 36 files(212 + claude-style 6 + merge-seams 7 + injector 5,自洽)
  - TDD waiver:injector 编排(真实 fs+注册表)以 tmpdir 全环测试替代纯冒烟(12/12b/2i/13/14 五用例),不属 waiver
- T4 三源退役清理 | 完成(2026-11-24)
  - 交付:use-terminal 删快照节流块/serializeVisibleLines/scheduleSnapshot/onTitleChange 订阅/titleSubscription 字段;契约删 state:title/state:snapshot 通道与 StateTitleEvent/StateSnapshotEvent 接口与 StateApi 两方法;preload 删两上行;ipc/state 壳 handler 删除;use-terminal.test mock/桩同步
  - 验证:残留 grep 清零(reportSnapshot/reportTitle/state:title/state:snapshot/serializeVisibleLines/scheduleSnapshot);typecheck exit 0;vitest 230 passed / 36 files;pnpm build 通过(渲染层改动必过 build——T9 白屏教训执行)
  - 口径:状态通道自此只下行(state:changed),上行唯一入口 = loopback receiver
- T5 冒烟发现①:pi 启动欢迎屏误触发 spinner | 已修(2026-11-24)
  - 现象(用户实机):新开会话弹「Welcome back! Press any key (29s)」欢迎屏,关闭后 spinner 亮起且卡住,首个回合完成才落 idle,后续正常
  - 根因(源码 + 探针双证):欢迎屏是 ctx.ui 阻塞屏,关闭发 ui_prompt_end——我们的 pi working 槽误挂了它(原意图「对话框关闭回 working」);探针另证干净项目全环正确(input/turn_*/agent_settled 顺序无误)、input 为提交语义非逐键、project_trust 已保存信任不发且项目级扩展实际收不到(信任解析先于项目扩展加载)
  - 修复:ui_prompt_end 摘出 working 槽(回 working 由 turn_start/turn_end/agent_settled 自然覆盖);新增 startup-splash 回归用例;插件注释同步源码结论
  - 生效路径:重启应用(reconcile 覆盖项目扩展文件,事件并集已变)→ 重开 pi 标签(pi 会话启动时重载扩展)
- T5 冒烟需求增补:working→idle 任务完成通知 | 已实现(2026-11-24,用户提出)
  - 需求:working 收口落 idle 时也弹系统通知,代表本次任务完成;同款后台判定(聚焦会话不打扰)
  - 实现:shouldNotify 接缝升级为迁移感知(NotifyInput 增 previous,返回 NotifyKind = waiting/done/null);
    ipc/state 闭包记前态,通知渲染按种类分流(「任务已完成」/「会话在等你输入」);seed(null 前态)天然不发
  - 用例矩阵 8 条(新增 working→idle 后台/聚焦、waiting→idle 不算完成、seed 不发四条);
    mutation check:迁移条件退化为只看当前态 → 用例 7/8 转红(留痕;还原时误用 git checkout 回退到旧提交版,
    发现后重写功能版——工具边界登记:未提交文件禁用 git checkout 还原)
  - 验证:typecheck exit 0;全量 235 passed / 36 files(230 + 通知矩阵 5,自洽)
