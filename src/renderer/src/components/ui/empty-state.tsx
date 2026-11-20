// 空态(spec B2:components/ui/ 空态与按钮)
export function EmptyState({ title, hint }: { title: string; hint?: string }): React.JSX.Element {
  return (
    <div className="flex flex-1 select-none flex-col items-center justify-center gap-1 p-4 text-center">
      <p className="text-sm text-zinc-500 dark:text-zinc-400">{title}</p>
      {hint && <p className="text-xs text-zinc-400 dark:text-zinc-500">{hint}</p>}
    </div>
  )
}
