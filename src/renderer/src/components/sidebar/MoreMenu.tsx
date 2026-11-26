// 「更多」行内小菜单(spec:components/sidebar/MoreMenu):项目行「…」弹出的动作面板——
// 「导入历史会话」开 agent 选择弹窗(import 模式),「建 worktree 会话」开 worktree 弹窗,
// 「移除项目」走既有 removeProject(无确认,行为不变)。
// 设置入口只在标题栏齿轮一处(2026-11-24 用户要求去掉本菜单里的同名项):应用级功能不该藏在项目级菜单里。
// worktree 入口只在「项目目录就是仓库根」时出现(spec 约束:排除文件固定写在 <项目>/.git/info/exclude,
// 故不必回溯上级目录):打开菜单即探一次 worktree:isRepoRoot,不是仓库根就不渲染该项。
// 开合态归 ProjectGroup 组件本地,关闭即复位;面板外垫透明遮罩,点外部即关闭。
// Why 定位用 fixed 而不是 absolute:侧栏列表是 overflow-y-auto 滚动容器,absolute 面板会被祖先裁剪——
// 2026-11-26 冒烟实证:项目在列表最底时面板只露一条边。fixed 以视口为参照不受 overflow 影响(整条布局
// 链无 transform/filter/backdrop-filter 祖先,否则 fixed 会退化为相对该祖先定位);坐标由触发按钮的
// getBoundingClientRect 现算——下方放得下就向下,放不下翻到上方,左右夹进视口。
import { Download, FolderGit2, Trash2 } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useAppStore } from '../../store/app-store'
import { bridge } from '../../ipc/bridge'
import type { Project } from '../../../../shared/types'

const GAP_PX = 4 // 面板与触发按钮的间距
const EDGE_PX = 8 // 面板与视口边缘的安全距离

export function MoreMenu({
  project,
  anchor,
  onClose,
  onRemove
}: {
  project: Project
  /** 触发按钮元素:面板坐标由它的视口矩形推算(fixed 定位,不受滚动容器裁剪) */
  anchor: HTMLElement
  onClose: () => void
  onRemove: (id: string) => void
}): React.JSX.Element {
  const openAgentDialog = useAppStore((state) => state.openAgentDialog)
  const openWorktreeDialog = useAppStore((state) => state.openWorktreeDialog)
  const menuRef = useRef<HTMLDivElement>(null)
  // null = 尚未测量:先以 opacity-0 渲染取自身尺寸,测量后才有坐标(避免用常量估高宽导致漂移)
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null)
  // 仓库根探测结果:null = 查询中,不渲染该项(反例也不渲染,菜单不出现不可用入口)
  const [isRepoRoot, setIsRepoRoot] = useState<boolean | null>(null)

  // 每次打开菜单现探一次:目录可能在应用外被 git init / 删除 .git
  useEffect(() => {
    let cancelled = false
    bridge.worktree
      .isRepoRoot(project.path)
      .then((value) => {
        if (!cancelled) {
          setIsRepoRoot(value)
        }
      })
      .catch((error: unknown) => {
        // 探测失败等同于「不是仓库根」:入口不出现,菜单其余两项照常
        console.error('探测仓库根失败:', error)
        if (!cancelled) {
          setIsRepoRoot(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [project.path])

  useLayoutEffect(() => {
    const menu = menuRef.current
    if (menu === null) {
      return
    }
    const rect = anchor.getBoundingClientRect()
    const width = menu.offsetWidth
    const height = menu.offsetHeight
    // 右对齐触发按钮;再夹进视口左右边界(窗口比面板还窄时至少保住左边界可点)
    const left = Math.max(
      EDGE_PX,
      Math.min(rect.right - width, window.innerWidth - width - EDGE_PX)
    )
    const below = rect.bottom + GAP_PX
    const top =
      below + height <= window.innerHeight - EDGE_PX
        ? below
        : Math.max(rect.top - GAP_PX - height, EDGE_PX)
    setPosition({ top, left })
    // 依赖 isRepoRoot:该项是探测回填后才插入的,晚到的一行会改面板高度,
    // 首次测量的坐标就不成立了(翻上方会压住触发按钮,向下会越出视口底部)。回填后重测一次
  }, [anchor, isRepoRoot])

  // 侧栏滚动 / 窗口尺寸变化即关闭:比跟随重算便宜,也不会出现面板脱离按钮的漂移。
  // scroll 不冒泡到 window,必须用 capture 才能接到侧栏内部滚动。
  useEffect(() => {
    const close = (event?: Event): void => {
      // 面板自身滚动(窗口极矮时 max-h 生效)不算「侧栏滚动」,否则面板一滚就自关
      const target = event?.target
      if (target instanceof Node && menuRef.current?.contains(target) === true) {
        return
      }
      onClose()
    }
    const onScroll = (event: Event): void => close(event)
    const onResize = (): void => close()
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onResize)
    }
  }, [onClose])

  // Esc 关闭(键盘口径只做这一条;M2/M3/M5/M6 登记的键盘项仍不做)
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <>
      {/* 透明遮罩:叠满整窗接住面板外的任意点击;叠在项目行上,须阻断冒泡避免连带「选中 + 展开切换」 */}
      <div
        className="fixed inset-0 z-40"
        onClick={(event) => {
          event.stopPropagation()
          onClose()
        }}
      />
      <div
        ref={menuRef}
        role="menu"
        aria-label={`项目「${project.name}」更多操作`}
        style={position ?? { top: -9999, left: -9999 }}
        className={`fixed z-50 max-h-[calc(100vh-16px)] w-44 overflow-y-auto rounded-md border border-line bg-surface py-1 shadow-lg transition-opacity ${
          position === null ? 'opacity-0' : 'opacity-100'
        }`}
        onClick={(event) => {
          // 面板自身(含 padding 空白)的点击不得冒泡到项目行,否则会连带「选中 + 展开切换」
          event.stopPropagation()
        }}
      >
        <button
          type="button"
          role="menuitem"
          className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-hover"
          onClick={(event) => {
            event.stopPropagation()
            openAgentDialog({ mode: 'import', projectId: project.id })
            onClose()
          }}
        >
          <Download className="size-3.5" aria-hidden />
          导入历史会话
        </button>
        {isRepoRoot === true && (
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-hover"
            onClick={(event) => {
              event.stopPropagation()
              // 目标项目随描述进 store:弹窗本体挂 App 根部,与菜单不在同一组件分支
              openWorktreeDialog({ projectId: project.id })
              onClose()
            }}
          >
            <FolderGit2 className="size-3.5" aria-hidden />建 worktree 会话
          </button>
        )}
        <button
          type="button"
          role="menuitem"
          className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-hover"
          onClick={(event) => {
            event.stopPropagation()
            onRemove(project.id)
            onClose()
          }}
        >
          <Trash2 className="size-3.5" aria-hidden />
          移除项目
        </button>
      </div>
    </>
  )
}
