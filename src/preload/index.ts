// 唯一桥:contextBridge 暴露类型化 API,渲染层一切主进程能力经此(AGENTS.md 工程边界)
import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { IPC_CHANNELS } from '../shared/ipc-contract'
import type { AppApi } from '../shared/ipc-contract'

const api: AppApi = {
  projects: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.projectsList),
    add: () => ipcRenderer.invoke(IPC_CHANNELS.projectsAdd),
    remove: (id) => ipcRenderer.invoke(IPC_CHANNELS.projectsRemove, id)
  },
  agents: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.agentsList)
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
