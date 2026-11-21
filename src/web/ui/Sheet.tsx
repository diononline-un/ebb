import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '../lib/cn.ts'
import { IconButton } from './IconButton.tsx'

export type SheetProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  children?: ReactNode
  footer?: ReactNode
  className?: string
}

/** Task details live in a sheet, never in a modal (§11). */
export function Sheet({ open, onOpenChange, title, description, children, footer, className }: SheetProps) {
  const { t } = useTranslation('common')

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="ebb-overlay" />
        <DialogPrimitive.Content className={cn('ebb-sheet', className)}>
          <div className="flex items-start justify-between gap-3">
            <DialogPrimitive.Title className="text-heading">{title}</DialogPrimitive.Title>
            <DialogPrimitive.Close asChild>
              <IconButton label={t('actions.close')}>
                <X size={24} aria-hidden="true" />
              </IconButton>
            </DialogPrimitive.Close>
          </div>
          {description ? (
            <DialogPrimitive.Description className="mt-1 text-small text-ink-2">
              {description}
            </DialogPrimitive.Description>
          ) : null}
          <div className="mt-4">{children}</div>
          {footer ? <div className="mt-6 flex justify-end gap-2">{footer}</div> : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
