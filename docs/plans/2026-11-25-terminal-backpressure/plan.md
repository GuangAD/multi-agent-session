# 终端输出背压与渲染修复 · 切片

> 2026-11-25 | 状态:草稿

## 任务

- [x] **T1 xterm 补丁重放**
      交付:Orca 根级 xterm 补丁经补丁机制重放成功;类型检查与全部单测绿;实机多开切换不再出现空白与整窗冻结(NaN 防护与回调快照化生效)
      挡谁:无(单测层面;T4 的实机验收体验依赖本任务先落地,见依赖节)
- [x] **T2 node-pty JS 层补丁重放**
      交付:node-pty 补丁重放成功,管道错误封堵、自退泄漏修复、加载重试生效;C++ 段进源码不编译;关标签 / agent 自退 / 强杀三场景冒烟正常
      挡谁:无
- [x] **T3 主进程合并转发**
      交付:新增合并器(16ms 窗口 + 64KB 阈值 + 退出前清空保序),pty:data 事件频率从每秒数千降到约 60;合并器三组行为单测绿
      挡谁:无
- [x] **T4 渲染层数据泵双闸与隐藏只缓冲**
      交付:统一队列(含既有暂存袋)、每帧喂入预算、写入回调在途上限、超限丢最旧;隐藏终端只入队不消费,切回渐进追平;调度器单测绿
      挡谁:T5(后台 fit 产生的数据由本任务的队列承接,体验验收才完整;单测不硬依赖)
- [x] **T5 隐藏后台 fit**
      交付:窗口尺寸稳定后,隐藏终端按假想尺寸分帧重设网格并同步 PTY;切回 shell 标签宽度立即正确
      挡谁:无
- [x] **T6 WebGL 回退重挂**
      交付:上下文丢失降级 DOM 后,下次激活尝试恢复 WebGL,失败保持 DOM;注入模拟验证
      挡谁:无
- [x] **T7 预览与终端共存渲染**
      交付:激活文件预览时终端实例保持挂载(仅隐藏),scrollback 与 TTY 状态不丢;切回后画面完整、无双 TUI、TUI 滚动正常(用户报障场景,根因 = 预览切换卸载 TerminalView,违背 ADR-0002)
      挡谁:无
- [x] **T8 文件预览样式跟随设置**
      交付:文件预览文本区的字体族/字号/字重取设置中的终端外观配置(单一来源),设置变更后已打开的预览即时跟随
      挡谁:无

## 依赖

全部任务的单测无硬依赖,「挡谁」仅 T4→T5 一条(承接关系,非用例依赖)。执行顺序:T1 → T2 → T7 → T8 → T3 → T4 → T5 → T6——补丁层最先落地(后续验证都在补丁后的世界),T7 紧随其后(用户实撞的报障,修复极小且独立)。

## 遗留项

- node-pty 补丁的构建配置段在将来重编译原生模块时的行为(brief 第 6 节未定项 2):特性外挂账,由 node-pty C++ 层挂账流程承接,本特性不排任务
- xterm 补丁附带段行为差异(brief 第 6 节未定项 1):在 T1 冒烟中就地验证消化,不留到任务之后
- T7 预览共存渲染无组件渲染测试基建,回归 = 原始报障场景实机复现 + 全量套件(debugging 收尾清单登记「无正确 seam」)

## 开发记录

- 回退协议登记(2026-11-25,切片期):brief 第 7.2 节接缝数量 2 → 3,增补「窗口稳定门」——T5 后台 fit 需要稳定信号才有测试落点,属需求阶段清单遗漏,不触及第 2/3/5 节方向,就地修订,门 2 一并呈报确认
- 门 2 批准与 T7 并入(2026-11-25):用户报障「预览激活后终端内容截断/双 TUI/滚动错乱」,根因 = TerminalTabs 预览分支卸载 TerminalView(违背 ADR-0002),按 debugging 流程定位后并入 T7,执行顺序 T2 → T7;门 2 五问随 T7 一并确认
- T8 并入(2026-11-25,门 2 后用户补充):文件预览文字样式跟随设置——原留痕 TODO.md 已移入本特性(TODO 对应条目删除);执行顺序 T7 → T8
- **T1 完成**(2026-11-25,commit 5e5fc0f1):重放零冲突;源码段标记 `hasMeasuredCellHeight` 5 处、CoreBrowserTerminal/RenderDebouncer/CompositionHelper 各段特有标记在位;产物段 sha256 变化实证;typecheck exit 0;全量 45 文件/315 用例绿与基线一致。冒烟(用户实机):标签切换无空白、无冻结、中文输入正常——**通过**;遗留观察:切回多内容标签约 1 秒等待,登记 TODO 长期观察项(T4 落地后复测)。结论(下游):① patch_hash=6f384928… 可作 T2 同类验证参照;② 冒烟对照点 = Viewport NaN 防护 / RenderDebouncer 帧内 while+finally / CompositionHelper IME 事务;③ 升级 xterm 版本须重新生成并重放补丁(brief §4 既有约束)
- **T2 完成**(2026-11-25,commit 1cdf85f6):重放零冲突;JS 段标记 `ConPTY output relay exited` 在位;binding.gyp 段移除 Windows 原生编译目标,与「C++ 段进源码不编译」自洽(conpty.dll/OpenConsole.exe 时间戳仍为基线,未触发编译);typecheck exit 0;全量 45/315 绿与基线一致。冒烟(用户实机):agent 自退正常关、pi 运行中关标签无错、强杀不波及其余终端——**通过**。结论(下游):① C++ 段落地情况 = conpty.cc 17 处 / pty.cc 16 处 Orca 标记,含 TerminateJobObject(类别 C 延期的源码已就位,仅差编译链);② typings 段(getForegroundProcessGroup? 等)已落地但本项目不接桥;③ T7 可开工,TerminalTabs 渲染结构改造不受本任务影响
- **T7 完成**(2026-11-25,commit 56609465):改动仅 TerminalTabs.tsx(+22/-11),终端组移出预览条件分支常驻渲染,`active` 收窄为「标签激活且预览未激活」,TerminalView 本体零改动;use-terminal 31/31、typecheck exit 0、全量 45/315 绿与基线一致。实机验证(用户复现原始报障场景):预览开合后画面完整无双 TUI、TUI 内翻页滚动正常、预览期间切标签终端状态正常——**通过**。边界核实:`previewActive && previewPath === null` 无可达入口(openPreview 同置/closePreview 同清/activatePreview 仅从既有预览标签触发),新旧行为差异仅存于不可达分支。结论(下游):① 预览卸载路径消失,暂存袋回归「进程输出早于终端创建」的正常兜底语义;② T4 隐藏只缓冲从第一天即完整语义(隐藏终端实例存活,入队即可);③ deactivatePreview 只清 active 不清 path(标签停留栏上)——T8 的预览重挂读取态归零语义与此无关,不受影响
- **T8 完成**(2026-11-25,commit 1c83a6cd):FilePreview 文本区接入 useSettings + resolveTerminalAppearance(单一来源),`<pre>` 三项 inline style,头部/提示样式未动;typecheck exit 0、全量 45/315 绿与基线一致。实机目验(用户):设置变更即时跟随、中文与长行不破版——**通过**;字号观感(px 直传 vs 终端 pt 换算)用户裁量接受现状,不换算。流程调整(controller 裁决,2026-11-25):T3–T6 实机验证不阻塞后续任务开发,统一攒到全部任务结束后一次验证;期间以单测+全量套件为门。结论(下游):① FilePreview 已订阅全量 settings,后续加 lineHeight 等外观跟随在 appearance 上取值即可;② file-panel 目录无 *.test.ts,scoped vitest 恒 exit 1(no test files),复用该命令时预期此结果
- **T3 完成**(2026-11-25,commit 147f6b35):新增合并器(9 用例,TDD)+ ipc/pty.ts 接线(onData→push,onExit→先 flushSession 再 pty:exit,档位 16ms/64KB 模块级常量);typecheck exit 0,全量 46 文件/324 用例绿。评审(独立 reviewer):**approve**——规格逐条符合,状态机生命周期无正确性缺陷,推演写坏实现均可被现有用例抓住;3 Minor 处置 = ①② 补守卫用例(恰等边界 + flushSession 定时器取消取证,mutation check 双向验证红因正指缺口),③ timer 注入措辞偏离裁定接受现状(fake timers 等价,不加注入参数)。实机验证(ptv:data 频率 ~60/s)按流程调整延后统一验证。结论(下游):① flush 投递口注入已满足可测性,后续任务勿再加 timer 注入参数;② merge 后每会话事件率 ≈ 60/s,T4 渲染层队列消费预算以此为输入量级;③ 合并器单实例应用生命周期复用,destroy 仅测试收尾调用
- **T4 完成**(2026-11-25,commit 5a92cd9d):新增写入调度器(10 用例,双闸 + 可见性 + 丢最旧,settle 防御);use-terminal 重构(pendingData 暂存袋移除并入调度器、真背压 write 包装、RAF 泵帧三事件驱动无进展停帧、薄导出 setTerminalVisible 统一落闸);TerminalView 激活 effect 补失活分支;桩迁移 write(data,done) 形态(31→33 用例,先到先得断言逐字不变);全量 47 文件/336 用例绿,typecheck exit 0。评审(独立 reviewer):**request-changes → 处置后闭合**——发现 1(Important)预览打开路径可见性闸失联(previewActive 置全部 active=false 不经 activateTerminal,旗标滞留 true 持续喂入隐藏 xterm),按授权补 TerminalView 失活分支 + 薄导出 + 接线用例(先红后绿,红因正指盲区)闭合;发现 2(Minor)注释对齐合并器实况;发现 3(Minor 流程)本条即 controller 记账。两处授权内偏离成立:泵改事件驱动排帧(穷尽解锁条件,空闲零帧耗)、openTerminal 按容器实况落闸(正确处理 T7 预览期出生隐藏终端)。实机验证(渐进追平体验/隐藏 CPU)按流程调整延后。结论(下游):① 隐藏零解析全路径闭合(标签切换 + 预览两条路都有闸);② 切回追平速度 ≈ 16 帧/4MB ≈ 270ms,验证时对照 T1 遗留「1 秒等待」观察项;③ T5 后台 fit 落闸调用面 = setTerminalVisible(勿直调 writeScheduler)
- **T5 完成**(2026-11-25,commit 5a1fe562):新增稳定门 createStableResizeGate(3 用例,续期/恰一次/重入/reset)+ fitHiddenTerminals(假想网格换算与 StableCellFitAddon 同一测量点、分帧每帧一个、可重入防抖、竞态守卫、单点失败吞掉)+ App.tsx 接线(window resize → 200ms 稳定门 → fitHiddenTerminals);守卫用例补齐(关闭重建同 id 跳过,变异验证红因正指孤儿旧条目盲区);全量 48 文件/345 用例绿,typecheck exit 0。评审(独立 reviewer):**approve**——规格逐条符合;「同尺寸 resize no-op 不产生 pty:resize」经 xterm 库源码取证属实;与 T4 结论③调用面纪律(不绕调度器落闸)确认遵守;4 Minor 处置 = ①轮次排空期 settle 被丢=契约语义且激活路径自愈,接受现状(代码注释已含边界);②竞态守卫补用例(已闭合);③注释出处修正(已闭合);④PTY 半边单测不可观察=接缝定义如此,实机冒烟兜底,登记备查。实机验证(切回宽度立即正确、拖拽无振荡)按流程调整延后。结论(下游):① T6 不触碰本任务文件(调度器/稳定门/fitHiddenTerminals 均冻结);② 拖拽期间窗口跟随走既有每终端 ResizeObserver,稳定门只补隐藏终端,双路径无交叉
- **T6 完成**(2026-11-25,commit 待回填):TerminalEntry 新增内部字段 webglLost;mountWebglAddon 模块私有 helper(openTerminal 初挂与激活重挂共用同一条挂载路径);activateTerminal 追加重挂分支(标记存在时尝试一次,成功清位,失败吞掉保持 DOM 稳态,无重试循环);冻结面(调度器/稳定门/fitHiddenTerminals)零触碰;既有降级路径行为逐字不变。TDD:4 用例红绿(用例名含 webgl,-t 过滤可解析),用例 4 变异验证红因正指「无标记激活零加载」;全量 48 文件/349 用例绿,typecheck exit 0。评审:冷却自审(controller)——无新接缝、状态机简单、冻结面遵守,通过。实机验证(WEBGL_lose_context 注入降级/重挂)按流程调整延后。结论(下游):① 全部 8 任务代码就位,进入统一实机验证(汇总 T3 频率/T4 追平与 CPU/T5 宽度/T6 注入/T1 遗留 1 秒复测);② addon 不自 dispose 的取证结论(addon 0.20.0-beta.329 源码)已固化在 mountWebglAddon 注释,后续升级 xterm-addon-webgl 时复核
- 开工前接口预检 | 通过
  - 跨任务共享接口:无——三个新接缝(合并器/调度器/稳定门)均在本任务内生产并消费;T4 → T5 仅为运行时数据承接(队列承接后台 fit 的 resize 数据),无接口签名依赖;T7 复用既有 TerminalView active/display 接缝,无新增导出
  - 接口与 spec 一致性:createPtyDataCoalescer / createWriteScheduler / createStableResizeGate / fitHiddenTerminals 四个接缝名与签名形状逐一对得上,spec 数据结构节与契约伪代码一致
  - 测试命令:文件级命令均可解析;T6 的 `-k "webgl"` 过滤已补用例命名要求;T3 首条命令改文件级避免 0 条误判;全部 Expected 已写跑测条数
