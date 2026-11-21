import * as DialogPrimitive from '@radix-ui/react-dialog'
import type { ReactNode } from 'react'
import { cn } from '../lib/cn.ts'

export type DialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  children?: ReactNode
  footer?: ReactNode
  className?: string
}

/** Only for destructive confirmation (§11). No motion of its own. */
export function Dialog({ open, onOpenChange, title, description, children, footer, className }: DialogProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="ebb-overlay" />
        <DialogPrimitive.Content className={cn('ebb-dialog', className)}>
          <DialogPrimitive.Title className="text-heading">{title}</DialogPrimitive.Title>
          {description ? (
            <DialogPrimitive.Description className="mt-2 text-small text-ink-2">
              {description}
            </DialogPrimitive.Description>
          ) : null}
          {children ? <div className="mt-4">{children}</div> : null}
          {footer ? <div className="mt-6 flex justify-end gap-2">{footer}</div> : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
