// git 域薄编排层:T10 七通道(状态/差异/暂存/取消暂存/提交/分支/切换)(spec 模块划分)
// 业务在 git-service(simple-git 封装 + 解析接缝),本层只做通道转发与错误归一。
// Why handler catch 后重新抛出:`ipcMain.handle` 的 rejection 会以 Error 形态到达渲染层 invoke,
// 渲染层 GitPanel 按 message 区分「不是 Git 仓库」与一般失败;不 catch 时 simple-git 的
// GitError 也照样 reject,但统一在这里转换可保证 message 稳定(不泄漏栈与内部路径细节)。
import { ipcMain } from 'electron'
import { IPC_CHANNELS } from './channels'
import { gitService } from '../git-service'
import type { GitStatus } from '../../shared/ipc-contract'

// 归一错误:保留原始 message(simple-git 的 "not a git repository" 等关键字渲染层要用)
function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}

export function registerGitIpc(): void {
  ipcMain.handle(IPC_CHANNELS.gitStatus, async (_event, root: string): Promise<GitStatus> => {
    try {
      return await gitService.for(root).status()
    } catch (error) {
      throw toError(error)
    }
  })

  ipcMain.handle(
    IPC_CHANNELS.gitDiff,
    async (_event, p: { root: string; path?: string }): Promise<string> => {
      try {
        return await gitService.for(p.root).diff(p.path)
      } catch (error) {
        throw toError(error)
      }
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.gitStage,
    async (_event, p: { root: string; paths: string[] }): Promise<void> => {
      try {
        await gitService.for(p.root).stage(p.paths)
      } catch (error) {
        throw toError(error)
      }
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.gitUnstage,
    async (_event, p: { root: string; paths: string[] }): Promise<void> => {
      try {
        await gitService.for(p.root).unstage(p.paths)
      } catch (error) {
        throw toError(error)
      }
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.gitCommit,
    async (_event, p: { root: string; message: string }): Promise<string> => {
      try {
        return await gitService.for(p.root).commit(p.message)
      } catch (error) {
        throw toError(error)
      }
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.gitBranches,
    async (_event, root: string): Promise<{ current: string; all: string[] }> => {
      try {
        return await gitService.for(root).branches()
      } catch (error) {
        throw toError(error)
      }
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.gitCheckout,
    async (_event, p: { root: string; branch: string }): Promise<void> => {
      try {
        await gitService.for(p.root).checkout(p.branch)
      } catch (error) {
        throw toError(error)
      }
    }
  )
}
