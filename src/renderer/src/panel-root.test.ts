// 右栏面板的根目录选择(T1):活动会话优先,否则回落选中的项目,两者皆无 = 空态。
// 期望值来源:T1 用例表(brief 第 5 节「面板跟随」;spec 覆盖标准 6/7/13/14)。
import { describe, expect, it } from 'vitest'
import { resolvePanelRoot } from './panel-root'
import type { Project, Session, SessionWorktree } from '../../shared/types'

const project: Project = { id: 'p1', path: 'D:/work/agent-sessions', name: 'agent-sessions' }
// 另一个项目:用来验证「回落选中项目」与「用会话所属项目」两种取值不会混淆
const otherProject: Project = { id: 'p2', path: 'D:/work/other', name: 'other' }

function session(worktree?: SessionWorktree): Session {
  return {
    id: 's1',
    projectId: project.id,
    agentId: 'claude',
    title: 's1',
    createdAt: '2026-11-26T00:00:00.000Z',
    origin: 'created',
    ...(worktree ? { worktree } : {})
  }
}

describe('resolvePanelRoot', () => {
  it('活动会话带 worktree、项目在场:用 worktree 路径', () => {
    const activeSession = session({
      path: 'D:/work/agent-sessions/.worktree/feat-x',
      branch: 'feat-x',
      baseBranch: 'main'
    })
    expect(
      resolvePanelRoot({
        activeSession,
        activeProject: project,
        selectedProject: otherProject
      })
    ).toBe('D:/work/agent-sessions/.worktree/feat-x')
  })

  it('活动会话无 worktree、项目在场:用项目路径', () => {
    expect(
      resolvePanelRoot({
        activeSession: session(),
        activeProject: project,
        selectedProject: otherProject
      })
    ).toBe('D:/work/agent-sessions')
  })

  it('无活动会话、有选中项目:用选中项目路径', () => {
    expect(
      resolvePanelRoot({
        activeSession: null,
        activeProject: null,
        selectedProject: otherProject
      })
    ).toBe('D:/work/other')
  })

  it('无活动会话、无选中项目:返回 null(面板空态)', () => {
    expect(
      resolvePanelRoot({ activeSession: null, activeProject: null, selectedProject: null })
    ).toBeNull()
  })

  it('活动会话在场但所属项目已删:回落选中项目,不抛错', () => {
    expect(
      resolvePanelRoot({
        activeSession: session(),
        activeProject: null,
        selectedProject: otherProject
      })
    ).toBe('D:/work/other')
  })
})
