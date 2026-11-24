// 数字输入框(T6 终审 P1-1):本地草稿态,失焦/回车才提交,方向键即时提交。
// Why 不能逐键直连 patch:主进程 applyPatch 会把越界值夹紧并回写 store,输入框 value 绑 store 时
// 逐键值会被就地改写——字号从 14 想键入 16,键到「1」就被夹成 8、再键成 86 夹成 32,16 根本打不进去;
// 回滚行数更重:输入中被夹到 1 会让每个 TerminalView 重跑 effect(全部终端销毁重建、画面丢失),
// 且每个中间值都落盘。草稿态把「输入中」与「已提交」分开。
import { useEffect, useState } from 'react'

export function NumberField({
  value,
  min,
  max,
  step = 1,
  onCommit,
  className = '',
  ariaLabel
}: {
  value: number
  min: number
  max: number
  step?: number
  onCommit: (next: number) => void
  className?: string
  ariaLabel?: string
}): React.JSX.Element {
  const [draft, setDraft] = useState(String(value))

  // 外部值变化(别的控件改、重载设置)时同步草稿;输入中不会被主进程回写打断
  useEffect(() => {
    setDraft(String(value))
  }, [value])

  const commit = (raw: string): void => {
    const parsed = Number(raw)
    // 空串 / 非数字 / 越界一律不提交,回到当前值:夹紧是主进程的职责,这里只挡明显无效输入
    if (raw.trim() === '' || !Number.isFinite(parsed) || parsed < min || parsed > max) {
      setDraft(String(value))
      return
    }
    if (parsed !== value) {
      onCommit(parsed)
    }
  }

  return (
    <input
      type="number"
      min={min}
      max={max}
      step={step}
      aria-label={ariaLabel}
      className={className}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={(event) => commit(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          commit((event.target as HTMLInputElement).value)
        }
        // 方向键是离散且必然合法的操作,即时提交(不必等失焦)
        if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
          const delta = event.key === 'ArrowUp' ? step : -step
          const next = Number((Number(draft) + delta).toFixed(4))
          if (Number.isFinite(next) && next >= min && next <= max) {
            event.preventDefault()
            setDraft(String(next))
            onCommit(next)
          }
        }
      }}
    />
  )
}
