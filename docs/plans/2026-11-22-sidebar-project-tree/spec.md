# 侧栏项目树与 agent 弹窗 · 技术规格

## 整体实现

纯渲染层改动。唯一新增的跨组件状态是 ui-slice 里的「弹窗描述」(模式 + 目标项目,可空):四个入口——标题行「+」之外的三个是项目行「+」(新建)、「更多」菜单的「导入历史会话」、App 的 Ctrl+N(新建,目标 = 选中项目)——都只调 `openAgentDialog` 写入描述;`AgentPickerDialog` 读该描述决定是否渲染,按模式展示「选择 agent 新建会话」或「导入历史会话」,用户点选 agent 后分别走既有的 `openSession`(建会话开标签)或 `importSessions`(扫描导入,结果显示在弹窗内)。`Sidebar` 重构为「标题行 + 可折叠项目树」并挂载弹窗;`NewSessionMenu`、`ImportMenu` 及其 store 布尔量删除。主进程、IPC、持久化零改动。

## 流程图

```mermaid
flowchart LR
  subgraph 入口
    A1[项目行 +] --> W
    A2[更多菜单·导入] --> W
    A3[App Ctrl+N] --> W
  end
  W[ui-slice.openAgentDialog] --> S[agentDialog: 模式+项目Id]
  S --> D[AgentPickerDialog]
  D -- new: 选 agent --> O[sessions.openSession]
  D -- import: 选 agent --> I[sessions.importSessions]
  O --> T[标签页 + PTY(既有链路)]
  I --> M[结果消息显示在弹窗内]
```

## 数据结构

```ts
// ui-slice:弹窗描述(替代原 newSessionMenuOpen 布尔量)
type AgentDialogMode = 'new' | 'import'

interface AgentDialogDescription {
  mode: AgentDialogMode
  projectId: ProjectId
}

// UiSlice 新增字段
agentDialog: AgentDialogDescription | null
openAgentDialog: (dialog: AgentDialogDescription) => void
closeAgentDialog: () => void
```

业务语义见 brief 第 2/5 节;不新增持久化字段,不触碰 shared 类型。

## 模块划分

- `src/renderer/src/store/ui-slice.ts` -- 弹窗描述状态的唯一持有者;删除 `newSessionMenuOpen` / `setNewSessionMenuOpen`
- `src/renderer/src/components/sidebar/AgentPickerDialog.tsx` -- 新增;弹窗本体,读 ui-slice 描述与 projects,拉 agent 清单,按模式渲染标题、置灰规则与提交行为
- `src/renderer/src/components/sidebar/Sidebar.tsx` -- 重构;「项目」标题行(右侧「+」= addProject)+ 项目列表 + 挂载 AgentPickerDialog + 删除确认弹窗保留
- `src/renderer/src/components/sidebar/ProjectGroup.tsx` -- 重构;项目行(chevron / 常驻「+」「…」)、点行选中+展开切换、展开态组件本地、会话列表与「显示更多」保留
- `src/renderer/src/components/sidebar/MoreMenu.tsx` -- 新增;「更多」小面板,两项:导入历史会话(开弹窗)、移除项目(既有 removeProject)
- `src/renderer/src/App.tsx` -- Ctrl+N 改调 `openAgentDialog`;删除对旧布尔量的引用
- 删除:`src/renderer/src/components/sidebar/NewSessionMenu.tsx`、`src/renderer/src/components/sidebar/ImportMenu.tsx`

依赖方向:入口(App、Sidebar、ProjectGroup、MoreMenu)→ ui-slice;AgentPickerDialog → ui-slice + sessions-slice + projects-slice;无反向依赖,不新增跨领域边。

## 技术选型与约束

- 不新增依赖:弹窗复用 ConfirmDialog 的遮罩/层级风格(fixed inset-0 z-50 bg-black/40),图标用已有 lucide-react
- 只用既有 bridge 能力:`agents.list`、`sessions.create`(经 openSession)、导入(经 importSessions);无新 IPC 通道
- 视觉沿用 zinc 色阶与 dark: class 策略;展开态、菜单开合态一律组件本地状态,不落盘
- 快捷键守卫沿用 App 既有输入态守卫,Ctrl+N 行为只在无终端焦点分支改写

## 覆盖标准

档位:抽样档

理由:唯一纯逻辑接缝是 ui-slice 的弹窗描述状态(单向设值/清空,无维度组合、无格式化);其余全部是 UI 装配,错误形态是「点不开/关不上」,靠 typecheck 与手动冒烟覆盖,冒烟清单即 brief 7.1。

最可能咬到的五种情况:

1. 初始未开弹窗 → agentDialog 为 null,不渲染弹窗 → 钉在 T1 用例 1
2. 打开(新建,项目 p1)→ 状态完整等于传入描述(模式与项目都对)→ 钉在 T1 用例 2
3. 打开后关闭 → 回到 null → 钉在 T1 用例 3
4. 已开着再开另一个(换模式/换项目)→ 整体覆盖为新描述,不残留旧字段 → 钉在 T1 用例 4
5. 未打开时调用关闭 → 保持 null 且不抛错(幂等)→ 钉在 T1 用例 5

隐含高风险输入扫描:mode 传任意字符串由 TypeScript 类型面挡住,机检(typecheck)覆盖,不设用例;目标项目在弹窗开着时被移除 → AgentPickerDialog 查不到项目按「不渲染」处理,属 UI 装配,冒烟清单覆盖;Ctrl+N 无选中项目不动作 → 冒烟清单覆盖。

## 接口面清单

- `ui-slice.agentDialog` -- 非接缝 -- 弹窗描述状态(只读消费)
- `ui-slice.openAgentDialog` -- 接缝 -- 写入/整体覆盖弹窗描述(状态仅有的两个写入口之一,另一个是 closeAgentDialog)
- `ui-slice.closeAgentDialog` -- 接缝 -- 清空弹窗描述(幂等)
- `AgentPickerDialog` -- 非接缝 -- 弹窗组件;重用语义:关闭即卸载,组件内 agent 清单与导入消息不跨开合保留,再次打开重新拉取
- `MoreMenu` -- 非接缝 -- 项目行更多菜单;重用语义:开合态组件本地,关闭即复位
- 删除:`newSessionMenuOpen`、`setNewSessionMenuOpen`、`NewSessionMenu`、`ImportMenu`(含 App.tsx 引用)
- 既有接口原样复用、不属本特性接口面:`addProject` / `removeProject` / `selectProject` / `openSession` / `importSessions` / `agents.list`
