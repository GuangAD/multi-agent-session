// files 域薄编排层:T9 文件浏览三通道(树/预览/外部编辑器打开)(spec 模块划分)
import { ipcMain } from 'electron'
import { IPC_CHANNELS } from './channels'
import { scanTree } from '../fs-tree'
import { readFilePreview } from '../file-content'
import { openInEditor } from './open-in-editor'
import type { FilePreviewResult, TreeNode } from '../../shared/ipc-contract'

export function registerFilesIpc(): void {
  // root 不存在/不可读:scanTree 内部兜底空树(controller 裁决 6,扫描失败不是致命错误)
  ipcMain.handle(IPC_CHANNELS.filesTree, (_event, root: string): Promise<TreeNode> =>
    scanTree(root)
  )
  // read 的错误经载荷 error 字段返回(裁决 4/6),handler 不抛
  ipcMain.handle(
    IPC_CHANNELS.filesRead,
    (_event, p: { path: string; maxBytes: number }): Promise<FilePreviewResult> =>
      readFilePreview(p)
  )
  // openInEditor 编排内已兜底(未装 VS Code 回退系统默认应用),不抛
  ipcMain.handle(
    IPC_CHANNELS.filesOpenInEditor,
    (_event, path: string): Promise<{ via: 'vscode' | 'system' }> => openInEditor(path)
  )
}
