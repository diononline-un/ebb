import type { ComponentProps } from 'react'
import { cn } from '../lib/cn.ts'

export type IconButtonProps = ComponentProps<'button'> & {
  /** Already translated; icon-only buttons need a name, not a tooltip (§8). */
  label: string
}

export function IconButton({ label, className, type = 'button', ...props }: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      className={cn(
        'inline-flex size-11 shrink-0 items-center justify-center rounded-pill text-ink-2 motion-quick hover:bg-surface-sunken hover:text-ink disabled:pointer-events-none disabled:text-ink-3',
        className,
      )}
      {...props}
    />
  )
}
