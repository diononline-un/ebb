import { X } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { IconButton } from '../../ui/IconButton.tsx'

const STORAGE_PREFIX = 'ebb.rollover.'

function readHidden(date: string): boolean {
  try {
    return localStorage.getItem(STORAGE_PREFIX + date) === '1'
  } catch {
    return false
  }
}

/** "3 tasks came along from yesterday" — calm, dismissible for the day (DESIGN §9, E2-P3). */
export function RolloverNote({ count, date }: { count: number; date: string }) {
  const { t } = useTranslation('today')
  const [hidden, setHidden] = useState(() => readHidden(date))

  if (count === 0 || hidden) return null

  const dismiss = () => {
    setHidden(true)
    try {
      localStorage.setItem(STORAGE_PREFIX + date, '1')
    } catch {
      // Private mode without storage: the note simply comes back next visit.
    }
  }

  return (
    <div className="flex items-start justify-between gap-3">
      <p className="max-w-[65ch] text-small text-ink-2">{t('rollover', { count })}</p>
      <IconButton label={t('rolloverDismiss')} onClick={dismiss}>
        <X size={20} aria-hidden="true" />
      </IconButton>
    </div>
  )
}
