// 基础按钮(spec B2:components/ui/ 空态与按钮)
import type { ButtonHTMLAttributes } from 'react'

type ButtonVariant = 'default' | 'ghost'

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  default:
    'bg-zinc-900 text-zinc-50 hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300',
  ghost: 'text-zinc-600 hover:bg-zinc-200 dark:text-zinc-300 dark:hover:bg-zinc-800'
}

export function Button({
  variant = 'default',
  className = '',
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }): React.JSX.Element {
  return (
    <button
      type={type}
      {...props}
      className={`inline-flex items-center justify-center gap-1.5 rounded px-2 py-1.5 text-sm disabled:opacity-50 ${VARIANT_CLASSES[variant]} ${className}`}
    />
  )
}
