// IPC 契约:通道名与载荷类型一一对应(spec 模块划分「契约先行」)
// 通道由任务增量补:T1 落 projects 三通道;T2 增补 agents:list;
// T3 增补 sessions:create、settings:get 与 pty:* 五通道(spawn/write/resize/kill + data/exit 事件);
// T4 补齐 sessions:* 全域(rename/remove/open/list,会话记录持久化 CRUD);
// state:changed 状态广播(hook-run-state T4:标题/快照上行随三源退役删除,状态证据改经 loopback receiver);
// T6 增补 sessions:import(按 agent 扫描存储,把属于该项目的历史会话导入应用记录);
// T9 增补 files:* 三通道(files:tree 文件树 / files:read 只读预览 / files:openInEditor 外部编辑器打开)。
import type { AgentListItem, ResumeRef } from './agents'
import type {
  AgentId,
  Project,
  ProjectId,
  Session,
  SessionId,
  SessionRunState,
  Settings
} from './types'

// 通道名常量:main/ipc/channels.ts 转发使用,preload 直接引用,保证单一拼写
export const IPC_CHANNELS = {
  projectsList: 'projects:list',
  projectsAdd: 'projects:add',
  projectsRemove: 'projects:remove',
  agentsList: 'agents:list',
  sessionsCreate: 'sessions:create',
  sessionsRename: 'sessions:rename',
  sessionsRemove: 'sessions:remove',
  sessionsOpen: 'sessions:open',
  sessionsList: 'sessions:list',
  sessionsImport: 'sessions:import',
  settingsGet: 'settings:get',
  // T11 增补:写设置(主题三态即时生效并持久化)
  settingsSet: 'settings:set',
  // T11 增补:渲染层上报「当前前台会话」(通知判定用:前台会话等输入不打扰)
  sessionsSetActive: 'sessions:set-active',
  // T11 增补:主进程 → 渲染层,点通知后要求聚焦某会话的标签页
  notifyOpen: 'notify:open',
  ptySpawn: 'pty:spawn',
  ptyWrite: 'pty:write',
  ptyResize: 'pty:resize',
  ptyKill: 'pty:kill',
  // T5:三源状态引擎的通道(上行标题/屏幕快照,下行状态广播)
  // hook-run-state T3:显式移除全部 hook 注入(用户主动停用)
  hooksRemove: 'hooks:remove',
  // T9:文件浏览三通道(树扫描 / 预览读取 / 外部编辑器打开)
  filesTree: 'files:tree',
  filesRead: 'files:read',
  filesOpenInEditor: 'files:openInEditor',
  // T10:git 七通道(状态/差异/暂存/取消暂存/提交/分支/切换);不做 push/pull/rebase
  gitStatus: 'git:status',
  gitDiff: 'git:diff',
  gitStage: 'git:stage',
  gitUnstage: 'git:unstage',
  gitCommit: 'git:commit',
  gitBranches: 'git:branches',
  gitCheckout: 'git:checkout',
  // 主进程 → 渲染层事件通道(ipcRenderer.on 订阅)
  // 主进程 → 渲染层事件通道(ipcRenderer.on 订阅)
  ptyData: 'pty:data',
  ptyExit: 'pty:exit',
  stateChanged: 'state:changed',
  // 主进程回填/标题补捞改写会话记录(externalSessionId/标题)后的广播(渲染层原位 upsert)
  sessionsChanged: 'sessions:changed'
} as const

// preload 暴露给渲染层的桥接 API 面;main 按此注册 handler
export interface ProjectsApi {
  list: () => Promise<Project[]>
  add: () => Promise<Project | null> // null:用户取消了目录选择
  remove: (id: ProjectId) => Promise<{ closedTabs: SessionId[] }> // 删除项目连带删其下会话记录(2026-11-21 变更);closedTabs = 需关闭的标签页
}

export interface AgentsApi {
  // 安装检测在主进程完成:一次返回全部定义与安装状态(def 可整体结构化克隆)
  list: () => Promise<AgentListItem[]>
}

// T4:会话记录持久化 CRUD(主进程 sessionRecords + 防抖落盘);重命名只改应用侧显示名
export interface SessionsApi {
  create: (p: { projectId: ProjectId; agentId: AgentId }) => Promise<Session>
  rename: (p: { id: SessionId; title: string }) => Promise<void>
  // 删除记录;closedTabs = 需连带关闭的标签页(主进程按活动 PTY 判定)
  remove: (id: SessionId) => Promise<{ closedTabs: SessionId[] }>
  // 重开:记录存在则更新 lastOpenedAt 并返回;续接决策由渲染层在 pty:spawn 载荷以可选 resume 透传(T8)
  open: (id: SessionId) => Promise<Session>
  list: (projectId: ProjectId) => Promise<Session[]>
  // T11:上报当前前台会话(null = 没有标签在前台),主进程据此决定等输入是否弹通知
  setActive: (id: SessionId | null) => Promise<void>
  // T6:扫描该 agent 在本项目目录下的历史会话并入库(按 (agentId, externalSessionId) 去重);skipped = 去重命中数
  import: (p: { projectId: ProjectId; agentId: AgentId }) => Promise<{
    imported: number
    skipped: number
  }>
  // 主进程回填/标题补捞改写记录后的广播(externalSessionId/标题写回;渲染层原位 upsert,侧栏即时跟随)
  onChanged: (listener: (session: Session) => void) => () => void
}

// 终端渲染参数(scrollback 默认 10000)与主题;T3 只读,T11 增补写入(主题切换)
export interface SettingsApi {
  get: () => Promise<Settings>
  // 局部更新并落盘;返回更新后的完整设置(渲染层据此同步本地状态)
  set: (patch: Partial<Settings>) => Promise<Settings>
}

export interface PtyDataEvent {
  sessionId: SessionId
  data: string
}

export interface PtyExitEvent {
  sessionId: SessionId
  exitCode: number
}

export interface PtyApi {
  // cols/rows = 渲染层 fit 提案(T3.5 评审期 Fix-A):启动尺寸用渲染层已测值,避免 80×24 起步
  // 导致 TUI 错宽(pi 收不到 ConPTY 的 resize 通知,启动宽度即终身宽度);主进程对非法值
  // 回退未测量兜底 120×40。Orca pty-first-size 同思路(src/main/ipc/pty/delivery/pty-first-size.ts)。
  // T8:resume 可选——重开续接的定位原料(自建且回填过 id 的会话才有;imported/无 id 不带,
  // 原样拉起);主进程经 def.sessions.resumeArgv 构造参数后注入启动行。
  spawn: (p: {
    sessionId: SessionId
    agentId: AgentId
    cwd: string
    cols: number
    rows: number
    resume?: ResumeRef
  }) => Promise<void>
  write: (p: { sessionId: SessionId; data: string }) => Promise<void>
  resize: (p: { sessionId: SessionId; cols: number; rows: number }) => Promise<void>
  kill: (sessionId: SessionId) => Promise<void>
  // 事件订阅用 ipcRenderer.on 类型化封装;订阅返回退订函数(契约推荐形态)
  onPtyData: (listener: (event: PtyDataEvent) => void) => () => void
  onPtyExit: (listener: (event: PtyExitEvent) => void) => () => void
}

// T5:状态引擎的三路出入口。上行两条是渲染层独有的输入源(xterm 标题事件、屏幕快照),
// 字节源在主进程内直取 pty:data,不经桥;下行 state:changed = 去抖后的状态广播。
export interface StateChangedEvent {
  sessionId: SessionId
  state: SessionRunState
}

// T11:点通知后主进程通知渲染层聚焦某个会话
export interface NotifyOpenEvent {
  sessionId: SessionId
}

export interface StateApi {
  onChanged: (listener: (event: StateChangedEvent) => void) => () => void
  // T11:点了等输入通知 → 聚焦对应会话标签页
  onNotifyOpen: (listener: (event: NotifyOpenEvent) => void) => () => void
}

// T9:文件树节点。children === undefined 表示该目录层尚未扫描(懒展开标记,
// 主进程 scanTree 单层扫描恒如此),children === [] 表示已扫描且为空目录
export interface TreeNode {
  name: string
  path: string
  kind: 'dir' | 'file'
  children?: TreeNode[]
}

// T10:git:status 载荷(spec 数据结构)。staged/unstaged = porcelain 的 X/Y 单字符
// (左 = 暂存区相对 HEAD,右 = 工作区相对暂存区);未跟踪条目 staged 留空、unstaged 记 '?',
// 让渲染层「staged 非空 → 已暂存组」的分组语义与「暂存」按钮一致
export interface GitStatus {
  branch: string
  entries: Array<{ path: string; staged: string; unstaged: string }>
}

// T9:files:read 载荷。error 存在 = 读取失败(文件不存在/无权限/是目录),
// 此时其余字段为兜底空值;二进制命中时 content 为空串(不渲染乱码)
export interface FilePreviewResult {
  content: string
  truncated: boolean
  binary: boolean
  error?: string
}

// T9:文件浏览(树懒展开 + 只读预览 + 外部编辑器打开)。read 的错误经载荷 error 字段返回,
// tree 的扫描失败经主进程兜底空树,openInEditor 的回退在编排内完成——三者都不向渲染层抛
export interface FilesApi {
  tree: (root: string) => Promise<TreeNode>
  read: (p: { path: string; maxBytes: number }) => Promise<FilePreviewResult>
  openInEditor: (path: string) => Promise<{ via: 'vscode' | 'system' }>
}

// T10:Git 面板(本地操作;不做 push/pull/rebase)。错误经 invoke rejection 传渲染层,面板 catch 后
// 区分「不是 Git 仓库」与一般失败
export interface GitApi {
  status: (root: string) => Promise<GitStatus>
  diff: (p: { root: string; path?: string }) => Promise<string>
  stage: (p: { root: string; paths: string[] }) => Promise<void>
  unstage: (p: { root: string; paths: string[] }) => Promise<void>
  commit: (p: { root: string; message: string }) => Promise<string>
  branches: (root: string) => Promise<{ current: string; all: string[] }>
  checkout: (p: { root: string; branch: string }) => Promise<void>
}

export interface HooksApi {
  // 显式移除全部 managed 注入(项目级四家 + kimi 全局 marker);用户内容保留
  remove: () => Promise<void>
}

export interface AppApi {
  projects: ProjectsApi
  agents: AgentsApi
  sessions: SessionsApi
  settings: SettingsApi
  pty: PtyApi
  state: StateApi
  hooks: HooksApi
  files: FilesApi
  git: GitApi
}
