// 侧栏:顶部「项目」标题行(右侧「+」= 系统目录选择框添加项目)+ 项目分组树 + 删除确认弹窗 + agent 选择弹窗(T1)
// 会话记录来自 store.json(重启不丢);新建/导入会话经 AgentPickerDialog 选 agent,删除须经确认
// T5:删除被 worktree 里的未提交改动挡住时,同一个确认框原地换成「强制删除」;取消任一步都只关框,
// 记录与目录都保留(主进程在 worktreeError 时本来就没删记录,store 也不会把记录移出列表)
import { useState } from 'react'
import { Plus } from 'lucide-react'
import { useAppStore } from '../../store/app-store'
import { AgentPickerDialog } from './AgentPickerDialog'
import { Button } from '../ui/button'
import { ConfirmDialog } from '../ui/confirm-dialog'
import { EmptyState } from '../ui/empty-state'
import { ProjectGroup } from './ProjectGroup'
import type { Session } from '../../../../shared/types'

// 删除确认的三态:confirm = 第一步;force = 被 worktree 里的改动挡住后的二次确认(detail 是 git 原文);
// failed = 调用本身失败,没有强删这条路,只能把原文显示给用户。
// 一份状态喂给同一个 ConfirmDialog,只换文案,不另造一套确认 UI
interface DeleteRequest {
  session: Session
  step: 'confirm' | 'force' | 'failed'
  detail?: string
}

// 三态的标题/正文/按钮:第一步说清删什么(worktree 会话连带删目录),第二步把 git 原文照登并点名会丢弃
// 未提交改动(brief 第 2 节:强删不得静默丢弃改动),第三步只报原文、按钮改成「知道了」
function describeDelete(request: DeleteRequest | null): {
  title: string
  message: string
  confirmLabel: string
} {
  if (request === null) {
    // 关合态不渲染,这里只是给 ConfirmDialog 的必填 props 占位
    return { title: '', message: '', confirmLabel: '删除' }
  }
  const { session } = request
  const branch = session.worktree?.branch ?? ''
  if (request.step === 'force') {
    return {
      title: `强制删除会话「${session.title}」?`,
      message: `worktree 目录没删成,git 原文:${request.detail ?? ''}。继续会丢弃该目录里未提交的改动,并删掉目录与会话记录(分支 ${branch} 保留)。`,
      confirmLabel: '强制删除(丢弃未提交改动)'
    }
  }
  if (request.step === 'failed') {
    return {
      title: `删除会话「${session.title}」失败`,
      message: `${request.detail ?? ''}(会话与目录都没变,可稍后重试)`,
      confirmLabel: '知道了'
    }
  }
  return {
    title: `删除会话「${session.title}」?`,
    message: session.worktree
      ? `该会话在 worktree ${session.worktree.path} 里,会连带删掉这个目录(分支 ${branch} 保留);agent 存储里的对话内容不受影响,打开的标签页一并关闭。目录里有未提交改动时 git 会拒绝,再让你确认强删。`
      : '只删除应用内的会话记录,agent 存储里的对话内容不受影响;有打开的标签页会一并关闭。',
    confirmLabel: '删除'
  }
}
export function Sidebar(): React.JSX.Element {
  const projects = useAppStore((state) => state.projects)
  const sessions = useAppStore((state) => state.sessions)
  const selectedProjectId = useAppStore((state) => state.selectedProjectId)
  const selectProject = useAppStore((state) => state.selectProject)
  const addProject = useAppStore((state) => state.addProject)
  const removeProject = useAppStore((state) => state.removeProject)
  const removeSession = useAppStore((state) => state.removeSession)
  const [deleteRequest, setDeleteRequest] = useState<DeleteRequest | null>(null)
  // 一次删除往返内的忙碌态:删除要跑主进程的 git 命令(可能含 800ms 重试),期间确认框禁点
  const [removing, setRemoving] = useState(false)

  const submitRemove = async (request: DeleteRequest): Promise<void> => {
    if (removing) {
      return
    }
    // 只关框:failed 态的按钮是「知道了」,不该再触发一次删除
    if (request.step === 'failed') {
      setDeleteRequest(null)
      return
    }
    setRemoving(true)
    try {
      const result = await removeSession(
        request.session.id,
        request.step === 'force' ? { forceWorktree: true } : undefined
      )
      // Why 带身份校验的函数式更新:这次往返要跑主进程的 git(可能含 pty 树杀与 800ms 重试),
      // 期间用户可能已经取消、或给另一条会话打开了框;无条件写会「让取消过的框自己弹回来」,
      // 也会把别人刚打开的框静默关掉。
      setDeleteRequest((current) => {
        if (current === null || current.session.id !== request.session.id) {
          return current
        }
        if (result.ok) {
          return null
        }
        // 记录没删成(store 保证列表原样):按失败类型换文案——worktree 给强删这一步,传输失败只报原文
        return result.kind === 'worktree'
          ? { session: request.session, step: 'force', detail: result.worktreeError }
          : { session: request.session, step: 'failed', detail: result.message }
      })
    } finally {
      setRemoving(false)
    }
  }

  const dialog = describeDelete(deleteRequest)

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      {/* 标题行:左侧文字标签 + 右侧「+」(与项目行、标题栏的图标按钮同款 ghost 样式) */}
      <div className="flex items-center justify-between pr-0.5">
        <span className="px-1 text-sm font-semibold">项目</span>
        <Button
          variant="ghost"
          aria-label="添加项目"
          className="!px-1.5 !py-1"
          onClick={() => void addProject()}
        >
          <Plus className="size-4" aria-hidden />
        </Button>
      </div>
      {projects.length === 0 ? (
        <EmptyState title="还没有项目" hint="点击右上角「+」,选择一个文件夹开始" />
      ) : (
        <ul className="flex-1 space-y-1 overflow-y-auto">
          {projects.map((project) => (
            <ProjectGroup
              key={project.id}
              project={project}
              sessions={sessions.filter((session) => session.projectId === project.id)}
              selected={project.id === selectedProjectId}
              onSelect={selectProject}
              onRemoveProject={(id) => void removeProject(id)}
              onDeleteSession={(session) => setDeleteRequest({ session, step: 'confirm' })}
            />
          ))}
        </ul>
      )}
      <AgentPickerDialog />
      <ConfirmDialog
        open={deleteRequest !== null}
        title={dialog.title}
        message={dialog.message}
        confirmLabel={dialog.confirmLabel}
        busy={removing}
        onCancel={() => setDeleteRequest(null)}
        onConfirm={() => {
          if (deleteRequest !== null) {
            void submitRemove(deleteRequest)
          }
        }}
      />
    </div>
  )
}
