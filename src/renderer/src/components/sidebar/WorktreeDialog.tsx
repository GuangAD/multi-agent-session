// 建 worktree 弹窗(T4,spec:components/sidebar/WorktreeDialog):起点分支下拉 + 名称 + agent 列表 + 错误区。
// 开关与目标项目读 ui-slice 的弹窗描述(入口在项目行「更多」菜单,与本组件不在同一组件分支);
// 骨架复用 ConfirmDialog 的遮罩风格,浮层 fixed 定位,不挂在侧栏滚动容器内。
// 点某个 agent = 提交:成功由本组件关弹窗(记录与标签页已就位),失败保持打开并显示 failure 与 detail。
// T6 处理 6:提交期显示「正在创建…」并允许关闭——建 worktree 要跑多条 git 命令,钉死弹窗只会让
// 用户干等;关掉后创建照旧在后台完成并开标签页。
import { useEffect, useRef, useState } from 'react'
import { AgentBadge } from '../../agents-display'
import { useAppStore } from '../../store/app-store'
import { bridge } from '../../ipc/bridge'
import type { AgentListItem } from '../../../../shared/agents'
import type { WorktreeFailure } from '../../../../shared/ipc-contract'
import type { Project } from '../../../../shared/types'

// 失败分类的用户可见标签(T5 定稿,逐条对齐 brief 第 2 节失败形态);detail 由主进程给
// (名称校验原因 / git 原文),有则接在标签之后——分类与原文都要看得见,用户才知道下一步改哪里。
// 三个无 detail 的冲突分类必须自带「怎么办」:只有分类名时用户不知道去清理什么
const FAILURE_LABEL: Record<WorktreeFailure, string> = {
  'name-invalid': '名称不合法',
  'dir-exists': '目标目录已存在(先清理 .worktree/ 下的同名目录再试)',
  'path-registered': '该路径已被 git 登记为 worktree(先 git worktree prune 或手工清理)',
  'session-taken': '已有会话占用该路径(先删掉那条会话再试)',
  'git-error': 'git 命令失败(常见原因:同名分支已存在)'
}

interface FailureState {
  failure: WorktreeFailure
  detail?: string
}

// 无 props 的挂载入口:描述为 null(未开)或目标项目查不到(弹窗开着时被移除)→ 渲染 null
export function WorktreeDialog(): React.JSX.Element | null {
  const worktreeDialog = useAppStore((state) => state.worktreeDialog)
  const projects = useAppStore((state) => state.projects)
  if (!worktreeDialog) {
    return null
  }
  const project = projects.find((item) => item.id === worktreeDialog.projectId) ?? null
  if (!project) {
    return null
  }
  // key 按项目取值:换项目即全新弹窗(名称、分支、错误区都归零,不跨项目残留)
  return <WorktreePanel key={project.id} project={project} />
}

function WorktreePanel({ project }: { project: Project }): React.JSX.Element {
  const closeWorktreeDialog = useAppStore((state) => state.closeWorktreeDialog)
  const createWorktree = useAppStore((state) => state.createWorktree)
  const loadAgents = useAppStore((state) => state.loadAgents)
  const agents = useAppStore((state) => state.agents)
  const [name, setName] = useState('')
  const [baseBranch, setBaseBranch] = useState('')
  const [branches, setBranches] = useState<{ current: string; all: string[] } | null>(null)
  const [failure, setFailure] = useState<FailureState | null>(null)
  // 分支列表读取失败与「创建失败」分开记:用户还没点过任何动作,不该看到「git 命令失败」这种创建期口径
  const [branchesError, setBranchesError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  // 提交期允许关闭 ⇒ 结果回来时组件可能已卸载。卸载后不再动 store:迟到的成功会关掉用户
  // 新开的弹窗,迟到的失败会把错误写进已经关掉的弹窗。StrictMode 的模拟重挂要重置为 false。
  const unmounted = useRef(false)

  // 打开即重扫 agent 安装状态(D7 同款):未安装的条目要置灰,新装 agent 重开弹窗即可见
  useEffect(() => {
    void loadAgents()
  }, [loadAgents])

  // 挂载时取起点分支候选(既有 git:branches),默认选中当前分支;
  // 取不到分支时弹窗不可提交,错误进同一错误区(不另开提示位)
  useEffect(() => {
    let cancelled = false
    bridge.git
      .branches(project.path)
      .then((next) => {
        if (cancelled) {
          return
        }
        setBranches(next)
        setBaseBranch(next.current)
      })
      .catch((error: unknown) => {
        console.error('读取分支列表失败:', error)
        if (!cancelled) {
          setBranchesError(error instanceof Error ? error.message : String(error))
        }
      })
    return () => {
      cancelled = true
    }
  }, [project.path])

  // Esc 关闭:弹窗自身监听,App 全局快捷键只拦带修饰键的组合,互不干扰
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        closeWorktreeDialog()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [closeWorktreeDialog])

  useEffect(() => {
    unmounted.current = false
    return () => {
      unmounted.current = true
    }
  }, [])

  const submit = async (agent: AgentListItem): Promise<void> => {
    setSubmitting(true)
    setFailure(null)
    try {
      const result = await createWorktree(project, {
        name: name.trim(),
        baseBranch,
        agentId: agent.def.id
      })
      if (unmounted.current) {
        // 弹窗已关:成功时记录与标签页已在 store 侧落地,不动 UI 即可;失败则没有任何出口
        // (应用无通知设施),至少留一条控制台记录,别让原因永久丢失
        if (!result.ok) {
          console.error('建 worktree 失败(弹窗已关闭):', result.failure, result.detail ?? '')
        }
        return
      }
      if (result.ok) {
        // 成功:记录与标签页已就位(首个 fit 触发 spawn),关弹窗
        closeWorktreeDialog()
        return
      }
      // 失败:不改 store、不开标签页,弹窗保持打开把原因显示出来
      setFailure({ failure: result.failure, detail: result.detail })
    } finally {
      // 成败都解除禁用:漏一次就会把弹窗永久锁在「提交中」
      setSubmitting(false)
    }
  }

  const canSubmit = !submitting && name.trim() !== '' && baseBranch !== '' && branches !== null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`在「${project.name}」建 worktree 会话`}
      onClick={closeWorktreeDialog}
    >
      <div
        className="w-full max-w-md rounded-lg bg-surface p-6 shadow-lg"
        onClick={(event) => event.stopPropagation()}
      >
        <h3 className="text-base font-semibold">建 worktree 会话</h3>
        <p className="mt-2 text-xs leading-relaxed text-ink-muted">
          在 {project.path} 下新建 .worktree/&lt;名称&gt;,该会话的终端与面板以该目录为根
        </p>

        <label className="mt-6 flex items-center gap-3 text-xs text-ink-muted">
          <span className="shrink-0">名称</span>
          <input
            className="min-w-0 flex-1 rounded border border-line bg-transparent px-2.5 py-1.5 text-sm outline-none focus:border-ink-muted"
            placeholder="feat-a"
            value={name}
            disabled={submitting}
            onChange={(event) => setName(event.target.value)}
          />
        </label>

        <label className="mt-4 flex items-center gap-3 text-xs text-ink-muted">
          <span className="shrink-0">起点分支</span>
          <select
            className="min-w-0 flex-1 rounded border border-line bg-transparent px-2.5 py-1.5 text-sm"
            value={baseBranch}
            disabled={submitting || branches === null}
            onChange={(event) => setBaseBranch(event.target.value)}
          >
            {(branches?.all ?? []).map((branch) => (
              <option key={branch} value={branch}>
                {branch}
              </option>
            ))}
          </select>
        </label>

        <p className="mt-6 text-xs text-ink-muted">
          {submitting
            ? '正在创建…(可以关掉本窗口,创建会在后台完成并打开标签页)'
            : '选择 agent 立即创建'}
        </p>
        <ul className="mt-2 flex flex-col gap-1">
          {agents.map((agent) => {
            const { def, installed } = agent
            // 未安装 → 拉不起 CLI,条目置灰;提交中一律禁用(防重复建)
            const disabled = !canSubmit || !installed
            return (
              <li key={def.id}>
                <button
                  type="button"
                  disabled={disabled}
                  title={
                    !installed ? '未安装' : `在 ${project.name} 的 worktree 中启动 ${def.name}`
                  }
                  className={`flex w-full items-center gap-2 rounded px-2.5 py-2 text-left text-sm ${
                    disabled ? 'cursor-not-allowed opacity-50' : 'hover:bg-hover'
                  }`}
                  onClick={() => void submit(agent)}
                >
                  <AgentBadge icon={def.icon} color={def.color} name={def.name} />
                  <span className="min-w-0 flex-1 truncate">{def.name}</span>
                  {!installed && <span className="text-xs text-ink-muted">未安装</span>}
                </button>
              </li>
            )
          })}
        </ul>

        {failure && (
          <p className="mt-3 text-xs leading-relaxed text-rose-600 dark:text-rose-400">
            {FAILURE_LABEL[failure.failure]}
            {failure.detail ? `:${failure.detail}` : ''}
          </p>
        )}
        {/* 分支列表读不到 / 空仓库:两条都不是「创建失败」,分开说,否则用户以为是自己点错了 */}
        {branchesError !== null && (
          <p className="mt-3 text-xs leading-relaxed text-rose-600 dark:text-rose-400">
            读取分支列表失败:{branchesError}(关掉重开可重试)
          </p>
        )}
        {branches !== null && branches.all.length === 0 && (
          <p className="mt-3 text-xs leading-relaxed text-ink-muted">
            该仓库还没有任何分支(先提交一次,再回来建 worktree)
          </p>
        )}
      </div>
    </div>
  )
}
