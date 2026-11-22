import { X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '../../ui/Button.tsx'
import { IconButton } from '../../ui/IconButton.tsx'

export type UndoBarProps = {
  onUndo: () => void
  onClose: () => void
}

/** Five seconds of taking it back after a task was ticked off, then it is gone. */
export function UndoBar({ onUndo, onClose }: UndoBarProps) {
  const { t } = useTranslation('today')

  return (
    <div
      role="status"
      className="fixed inset-x-4 bottom-24 z-50 flex items-center justify-between gap-3 rounded-card border border-line bg-surface-2 p-3 shadow-float lg:inset-x-auto lg:right-6 lg:w-96"
    >
      <p className="text-small text-ink">{t('undoMessage')}</p>
      <div className="flex items-center gap-1">
        <Button type="button" variant="ghost" onClick={onUndo}>
          {t('undoAction')}
        </Button>
        <IconButton label={t('undoClose')} onClick={onClose}>
          <X size={20} aria-hidden="true" />
        </IconButton>
      </div>
    </div>
  )
}
