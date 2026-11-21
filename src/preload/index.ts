// 唯一桥:contextBridge 暴露类型化 API,渲染层一切主进程能力经此(AGENTS.md 工程边界)
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { IPC_CHANNELS } from '../shared/ipc-contract'
import type {
  AppApi,
  NotifyOpenEvent,
  PtyDataEvent,
  PtyExitEvent,
  StateChangedEvent
} from '../shared/ipc-contract'

// 事件订阅类型化封装:监听器只收载荷,退订函数回收包装器(契约推荐形态)
function subscribe<Payload>(channel: string, listener: (payload: Payload) => void): () => void {
  const wrapped = (_event: IpcRendererEvent, payload: Payload): void => {
    listener(payload)
  }
  ipcRenderer.on(channel, wrapped)
  return () => {
    ipcRenderer.removeListener(channel, wrapped)
  }
}

const api: AppApi = {
  projects: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.projectsList),
    add: () => ipcRenderer.invoke(IPC_CHANNELS.projectsAdd),
    remove: (id) => ipcRenderer.invoke(IPC_CHANNELS.projectsRemove, id)
  },
  agents: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.agentsList)
  },
  sessions: {
    create: (p) => ipcRenderer.invoke(IPC_CHANNELS.sessionsCreate, p),
    rename: (p) => ipcRenderer.invoke(IPC_CHANNELS.sessionsRename, p),
    remove: (id) => ipcRenderer.invoke(IPC_CHANNELS.sessionsRemove, id),
    open: (id) => ipcRenderer.invoke(IPC_CHANNELS.sessionsOpen, id),
    list: (projectId) => ipcRenderer.invoke(IPC_CHANNELS.sessionsList, projectId),
    setActive: (id) => ipcRenderer.invoke(IPC_CHANNELS.sessionsSetActive, id),
    import: (p) => ipcRenderer.invoke(IPC_CHANNELS.sessionsImport, p)
  },
  settings: {
    get: () => ipcRenderer.invoke(IPC_CHANNELS.settingsGet),
    set: (patch) => ipcRenderer.invoke(IPC_CHANNELS.settingsSet, patch)
  },
  pty: {
    spawn: (p) => ipcRenderer.invoke(IPC_CHANNELS.ptySpawn, p),
    write: (p) => ipcRenderer.invoke(IPC_CHANNELS.ptyWrite, p),
    resize: (p) => ipcRenderer.invoke(IPC_CHANNELS.ptyResize, p),
    kill: (sessionId) => ipcRenderer.invoke(IPC_CHANNELS.ptyKill, sessionId),
    onPtyData: (listener: (event: PtyDataEvent) => void) =>
      subscribe<PtyDataEvent>(IPC_CHANNELS.ptyData, listener),
    onPtyExit: (listener: (event: PtyExitEvent) => void) =>
      subscribe<PtyExitEvent>(IPC_CHANNELS.ptyExit, listener)
  },
  state: {
    // 上行:标题/屏幕快照(渲染层独有输入源;字节源在主进程内直取 pty:data)
    reportTitle: (p) => ipcRenderer.invoke(IPC_CHANNELS.stateTitle, p),
    reportSnapshot: (p) => ipcRenderer.invoke(IPC_CHANNELS.stateSnapshot, p),
    // 下行:去抖后的状态广播
    onChanged: (listener: (event: StateChangedEvent) => void) =>
      subscribe<StateChangedEvent>(IPC_CHANNELS.stateChanged, listener),
    // 下行:点了等输入通知 → 聚焦对应会话的标签页
    onNotifyOpen: (listener: (event: NotifyOpenEvent) => void) =>
      subscribe<NotifyOpenEvent>(IPC_CHANNELS.notifyOpen, listener)
  },
  // T9:文件浏览(树懒展开 / 只读预览 / 外部编辑器打开);read 错误经载荷 error 字段返回
  files: {
    tree: (root) => ipcRenderer.invoke(IPC_CHANNELS.filesTree, root),
    read: (p) => ipcRenderer.invoke(IPC_CHANNELS.filesRead, p),
    openInEditor: (path) => ipcRenderer.invoke(IPC_CHANNELS.filesOpenInEditor, path)
  },
  // T10:Git 面板(本地操作;不做 push/pull/rebase)
  git: {
    status: (root) => ipcRenderer.invoke(IPC_CHANNELS.gitStatus, root),
    diff: (p) => ipcRenderer.invoke(IPC_CHANNELS.gitDiff, p),
    stage: (p) => ipcRenderer.invoke(IPC_CHANNELS.gitStage, p),
    unstage: (p) => ipcRenderer.invoke(IPC_CHANNELS.gitUnstage, p),
    commit: (p) => ipcRenderer.invoke(IPC_CHANNELS.gitCommit, p),
    branches: (root) => ipcRenderer.invoke(IPC_CHANNELS.gitBranches, root),
    checkout: (p) => ipcRenderer.invoke(IPC_CHANNELS.gitCheckout, p)
  }
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
