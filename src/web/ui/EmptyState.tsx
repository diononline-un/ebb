import type { ReactNode } from 'react'
import { cn } from '../lib/cn.ts'

export type EmptyStateProps = {
  title: string
  description?: string
  action?: ReactNode
  className?: string
}

/** Text plus at most one action, no illustration (§8). */
export function EmptyState({ title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-start gap-3', className)}>
      <p className="text-body text-ink">{title}</p>
      {description ? <p className="max-w-[65ch] text-small text-ink-2">{description}</p> : null}
      {action}
    </div>
  )
}
