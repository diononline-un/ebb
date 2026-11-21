import type { ComponentProps } from 'react'
import { cn } from '../lib/cn.ts'

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return (
    <input
      className={cn(
        'min-h-11 w-full rounded-control border border-line bg-surface-sunken px-3 text-body text-ink placeholder:text-ink-3 disabled:text-ink-3',
        className,
      )}
      {...props}
    />
  )
}
