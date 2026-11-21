import type { ComponentProps } from 'react'
import { cn } from '../lib/cn.ts'

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return (
    <textarea
      className={cn(
        'min-h-24 w-full rounded-control border border-line bg-surface-sunken px-3 py-2 text-body text-ink placeholder:text-ink-3 disabled:text-ink-3',
        className,
      )}
      {...props}
    />
  )
}
