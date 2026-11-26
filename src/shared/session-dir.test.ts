// 会话运行目录的唯一来源(T1):终端 cwd、右栏面板根、后续 spawn 都取它。
// 期望值来源:T1 用例表(brief 第 2 节:有 worktree 用 worktree 路径,否则项目路径)。
import { describe, expect, it } from 'vitest'
import { resolveSessionDir } from './session-dir'
import type { Project, Session } from './types'

const project: Project = {
  id: 'p1',
  path: 'D:/work/agent-sessions',
  name: 'agent-sessions'
}

// 不带 worktree 字段的记录:模拟 worktree 功能上线前写入的旧记录(读写语义暂无人使用)
function legacySession(): Session {
  return {
    id: 's1',
    projectId: project.id,
    agentId: 'claude',
    title: 's1',
    createdAt: '2026-11-26T00:00:00.000Z',
    origin: 'created'
  }
}

describe('resolveSessionDir', () => {
  it('旧记录取项目路径', () => {
    expect(resolveSessionDir(legacySession(), project)).toBe(project.path)
  })

  it('有 worktree 取 worktree 路径', () => {
    const session: Session = {
      ...legacySession(),
      worktree: {
        path: 'D:/work/agent-sessions/.worktree/feat-x',
        branch: 'feat-x',
        baseBranch: 'main'
      }
    }
    expect(resolveSessionDir(session, project)).toBe('D:/work/agent-sessions/.worktree/feat-x')
  })

  it('worktree 显式为 undefined 等同缺字段,取项目路径', () => {
    // 约定:持久化里写出 undefined 与根本不写该键同义,两者都不能让目录变空
    const session: Session = { ...legacySession(), worktree: undefined }
    expect(resolveSessionDir(session, project)).toBe(project.path)
  })
})
