// 侧栏:添加目录 + 项目分组树(项目 → 会话行)+ 删除确认弹窗 + agent 选择弹窗(T1)
// 会话记录来自 store.json(重启不丢);新建会话经 AgentPickerDialog 选 agent(入库 + 开标签页),删除须经确认
import { useState } from 'react'
import { FolderOpen } from 'lucide-react'
import { useAppStore } from '../../store/app-store'
import { AgentPickerDialog } from './AgentPickerDialog'
import { Button } from '../ui/button'
import { ConfirmDialog } from '../ui/confirm-dialog'
import { EmptyState } from '../ui/empty-state'
import { ProjectGroup } from './ProjectGroup'
import type { Session } from '../../../../shared/types'

export function Sidebar(): React.JSX.Element {
  const projects = useAppStore((state) => state.projects)
  const sessions = useAppStore((state) => state.sessions)
  const selectedProjectId = useAppStore((state) => state.selectedProjectId)
  const selectProject = useAppStore((state) => state.selectProject)
  const addProject = useAppStore((state) => state.addProject)
  const removeProject = useAppStore((state) => state.removeProject)
  const removeSession = useAppStore((state) => state.removeSession)
  const [pendingDelete, setPendingDelete] = useState<Session | null>(null)

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <Button onClick={() => void addProject()}>
        <FolderOpen className="size-4" aria-hidden />
        添加目录
      </Button>
      {projects.length === 0 ? (
        <EmptyState title="还没有项目" hint="点击上方「添加目录」,选择一个文件夹开始" />
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
              onDeleteSession={setPendingDelete}
            />
          ))}
        </ul>
      )}
      <AgentPickerDialog />
      <ConfirmDialog
        open={pendingDelete !== null}
        title={`删除会话「${pendingDelete?.title ?? ''}」?`}
        message="只删除应用内的会话记录,agent 存储里的对话内容不受影响;有打开的标签页会一并关闭。"
        confirmLabel="删除"
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          const target = pendingDelete
          setPendingDelete(null)
          if (target) {
            void removeSession(target.id)
          }
        }}
      />
    </div>
  )
}
