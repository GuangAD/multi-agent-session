// worktree 域薄编排层(T2):取事实 → 冲突判定 → 执行 git → 写排除文件 → 落会话记录
// (spec 模块划分:src/main/ipc/worktree.ts)。规则在 git-worktree(纯函数 + 注入执行器的服务),
// 本层只做 IO 与组合;项目路径与会话记录由主进程自取,渲染层只传 id 与名称。
import { readFile, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ipcMain } from 'electron'
import { IPC_CHANNELS } from './channels'
import { agentRegistry } from '../agents/agent-registry'
import { gitService } from '../git-service'
import {
  buildExcludeContent,
  createWorktreeService,
  decideCreateConflict,
  validateWorktreeName,
  type GitRunner
} from '../git-worktree'
import { sessionRecords } from '../session-store/session-records'
import type { WorktreeCreateResult } from '../../shared/ipc-contract'
import type { AgentId, AppStore, ProjectId } from '../../shared/types'

// 生产执行器:worktree 与 git 面板共用同一个 simple-git 实例与 root 缓存(spec 技术选型)
const runGit: GitRunner = (root, args) => gitService.for(root).raw(args)

// git / fs 报错原文:解析层不吃异常,原文要送到界面上让用户看懂是哪一步出错
function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await stat(target)
    return true
  } catch {
    return false
  }
}

// 排除文件固定在 <项目>/.git/info/exclude(spec 技术选型:入口只在仓库根 == 项目目录时提供,
// 不回溯上级)。写失败只记日志:目录与会话都已就绪,排除没写进去只是让 .worktree/ 出现在
// git 面板的未跟踪列表里,不值得把已建成的 worktree 判为失败。
async function appendExclude(root: string): Promise<void> {
  const excludePath = join(root, '.git', 'info', 'exclude')
  try {
    // 只有「文件不存在」才当空串:其它读失败必须抛出,否则会用仅含 .worktree/ 的内容
    // 覆盖用户原有的 exclude 条目(T2 评审 Minor-2)
    const existing = await readFile(excludePath, 'utf8').catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') {
        return ''
      }
      throw error
    })
    const next = buildExcludeContent(existing)
    if (next !== existing) {
      await writeFile(excludePath, next, 'utf8')
    }
  } catch (error) {
    console.error('worktree 排除文件写入失败:', error)
  }
}

// scheduleSave = 会话记录落盘(由 registerSessionsIpc 导出的防抖写入口,入口层转交,
// 不跨域 import sessions 内部)
export function registerWorktreeIpc(store: AppStore, scheduleSave: () => void): void {
  const service = createWorktreeService(runGit)

  ipcMain.handle(IPC_CHANNELS.worktreeIsRepoRoot, async (_event, path: string): Promise<boolean> =>
    service.isRepoRoot(path)
  )

  ipcMain.handle(
    IPC_CHANNELS.worktreeCreate,
    async (
      _event,
      p: { projectId: ProjectId; name: string; baseBranch: string; agentId: AgentId }
    ): Promise<WorktreeCreateResult> => {
      const project = store.projects.find((item) => item.id === p.projectId)
      if (!project) {
        throw new Error(`项目不存在:${p.projectId}`)
      }
      // 处理 1:名称先挡,一条 git 命令都不执行,避免半成品目录
      const invalidName = validateWorktreeName(p.name)
      if (invalidName !== null) {
        return { ok: false, failure: 'name-invalid', detail: invalidName }
      }
      // agentId 支持别名(kimi-code),归一后落规范 id;标题用显示名(与 sessions:create 同款组合)
      const def = agentRegistry.getById(p.agentId)
      if (!def) {
        throw new Error(`未知 agent:${p.agentId}`)
      }
      // 处理 1b:入口只在「仓库根 == 项目目录」时提供(UI 按 isRepoRoot 隐藏菜单项),编排层
      // 必须自己把关:项目目录若只是上级仓库的子目录,list/add 会作用到上级仓库,而排除文件
      // 固定写 <项目>/.git/info/exclude 必然写不进去,结果是「建成功但 .worktree/ 从未被排除」。
      // Why 回 git-error 而不是新开枚举:与「git 说不行」同一类,原文足够让用户看懂。
      if (!(await service.isRepoRoot(project.path))) {
        // isRepoRoot 吞掉探测异常(不是仓库/不可访问),故这里不把话说死
        return {
          ok: false,
          failure: 'git-error',
          detail: '项目目录不是 git 仓库根,或该目录不可访问'
        }
      }

      const targetPath = join(project.path, '.worktree', p.name)
      // 处理 2:三样事实——目标目录是否存在(fs)、git 已登记路径(worktree list)、
      // 已有会话占用的路径(store)
      const dirExists = await pathExists(targetPath)
      let registeredPaths: string[]
      try {
        const refs = await service.list(project.path)
        registeredPaths = refs.map((ref) => ref.path)
      } catch (error) {
        return { ok: false, failure: 'git-error', detail: errorMessage(error) }
      }
      const sessionPaths = store.sessions.flatMap((session) =>
        session.worktree ? [session.worktree.path] : []
      )

      // 处理 3:冲突命中即回失败;未命中才能动手建
      const conflict = decideCreateConflict({
        targetPath,
        dirExists,
        registeredPaths,
        sessionPaths
      })
      if (conflict !== null) {
        return { ok: false, failure: conflict }
      }

      try {
        await service.add({
          root: project.path,
          path: targetPath,
          branch: p.name,
          base: p.baseBranch
        })
      } catch (error) {
        // 失败与退出:原文回传,不落记录、不删已建目录(目录属用户产物,交给人工)
        return { ok: false, failure: 'git-error', detail: errorMessage(error) }
      }

      // 处理 4:成功后把 .worktree/ 幂等追加进仓库本机排除文件
      await appendExclude(project.path)

      // 处理 5:写会话记录——worktree 三项、归一后的 agent id、标题取 agent 显示名
      const session = sessionRecords.create(store, {
        projectId: project.id,
        agentId: def.id,
        worktree: { path: targetPath, branch: p.name, baseBranch: p.baseBranch }
      })
      sessionRecords.rename(store, { id: session.id, title: def.name })
      scheduleSave()
      return { ok: true, session }
    }
  )
}
