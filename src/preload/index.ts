// 唯一桥:contextBridge 暴露类型化 API,渲染层一切主进程能力经此(AGENTS.md 工程边界)
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { IPC_CHANNELS } from '../shared/ipc-contract'
import type { AppApi, PtyDataEvent, PtyExitEvent } from '../shared/ipc-contract'

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
    create: (p) => ipcRenderer.invoke(IPC_CHANNELS.sessionsCreate, p)
  },
  settings: {
    get: () => ipcRenderer.invoke(IPC_CHANNELS.settingsGet)
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
