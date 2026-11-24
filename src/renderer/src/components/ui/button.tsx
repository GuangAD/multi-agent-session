// 基础按钮(spec B2:components/ui/ 空态与按钮)
import type { ButtonHTMLAttributes } from 'react'

type ButtonVariant = 'default' | 'ghost'

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  default:
    'bg-accent text-on-accent hover:bg-accent-hover',
  ghost: 'text-ink-muted hover:bg-hover'
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
