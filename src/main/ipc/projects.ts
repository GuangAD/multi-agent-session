// projects 域薄编排层:目录选择 → 归一化 → 去重 → 落盘
import { randomUUID } from 'node:crypto'
import { basename, normalize, sep } from 'node:path'
import { dialog, ipcMain } from 'electron'
import { IPC_CHANNELS } from './channels'
import { saveStoreAtomic } from '../session-store/store-persistence'
import { sessionRecords } from '../session-store/session-records'
import type { AppStore, Project, ProjectId, SessionId } from '../../shared/types'

// 归一化:统一分隔符;盘根(X:\)保留尾分隔符,否则会退化为盘相对路径
function normalizeProjectPath(raw: string): string {
  const normalized = normalize(raw)
  if (normalized.length > 3 && normalized.endsWith(sep)) {
    return normalized.slice(0, -1)
  }
  return normalized
}

// Windows 路径不区分大小写(spec:M4 cwd 匹配同样按此规则)
function isSameProjectPath(a: string, b: string): boolean {
  return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b
}

export function registerProjectsIpc(store: AppStore, storePath: string): void {
  ipcMain.handle(IPC_CHANNELS.projectsList, () => store.projects)

  ipcMain.handle(IPC_CHANNELS.projectsAdd, async (): Promise<Project | null> => {
    // 非模态系统目录对话框(主进程弹;不挂父窗避免焦点窗口为空时的类型分支)
    const picked = await dialog.showOpenDialog({
      title: '选择项目目录',
      properties: ['openDirectory']
    })
    if (picked.canceled || picked.filePaths.length === 0) {
      return null
    }
    const path = normalizeProjectPath(picked.filePaths[0])
    const existing = store.projects.find((project) => isSameProjectPath(project.path, path))
    if (existing) {
      return existing // 同路径不重复入库(幂等)
    }
    const project: Project = { id: randomUUID(), path, name: basename(path) }
    store.projects.push(project)
    await saveStoreAtomic(storePath, store)
    return project
  })

  // 删除项目连带删除其下会话记录(2026-11-21 变更,根治孤儿记录——删除项目重新添加
  // 后 projectId 变化,旧记录永不可见却占导入去重键);agent 存储不动(应用永不改写)。
  // 返回需连带关闭的标签页(杀 shell 编排由渲染层 closeTab 做,与 sessions:remove 同分工)
  ipcMain.handle(
    IPC_CHANNELS.projectsRemove,
    async (_event, id: ProjectId): Promise<{ closedTabs: SessionId[] }> => {
      const before = store.projects.length
      store.projects = store.projects.filter((project) => project.id !== id)
      if (store.projects.length !== before) {
        const closedTabs = sessionRecords.removeByProject(store, id)
        await saveStoreAtomic(storePath, store)
        return { closedTabs }
      }
      return { closedTabs: [] } // 未知项目:空操作(与 sessions:remove 的重复删除同口径)
    }
  )
}
