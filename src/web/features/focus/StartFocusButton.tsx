import { Play } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { FocusSession } from '../../../shared/schemas/focus.ts'
import type { BlockSlot } from '../../../shared/triage.ts'
import { Button } from '../../ui/Button.tsx'
import { Input } from '../../ui/Input.tsx'
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from '../../ui/Menu.tsx'
import { useStartFocus, useTimerDefault } from './api.ts'

const DURATIONS = [25, 50, 90]
const CUSTOM_MIN = 5
const CUSTOM_MAX = 180

export type StartFocusButtonProps = {
  slot?: BlockSlot
  taskId?: string
  /** A fixed length starts right away and skips the menu; the low-energy mode passes 10. */
  minutes?: number
  /** Rings once the server has started the session (the morning ritual leaves for today then). */
  onStart?: (session: FocusSession) => void
  className?: string
}

/** Starts a focus session: the usual length first, then the fixed ones, then a custom length. */
export function StartFocusButton({ slot, taskId, minutes, onStart, className }: StartFocusButtonProps) {
  const { t } = useTranslation('focus')
  const start = useStartFocus()
  const usual = useTimerDefault()
  const [custom, setCustom] = useState('')
  const [asking, setAsking] = useState(false)

  const begin = (length: number) => {
    // Asked once, on the click that starts a session, never on page load (E3: no push yet).
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      void Notification.requestPermission().catch(() => {})
    }
    start.mutate(
      {
        plannedMinutes: length,
        ...(slot ? { slot } : {}),
        ...(taskId ? { taskId } : {}),
      },
      { onSuccess: (session) => onStart?.(session) },
    )
    setAsking(false)
  }

  if (minutes !== undefined) {
    return (
      <Button type="button" variant="secondary" className={className} disabled={start.isPending} onClick={() => begin(minutes)}>
        <Play size={20} aria-hidden="true" />
        {t('start.fixed', { minutes })}
      </Button>
    )
  }

  const customLength = Number(custom)
  const customValid = Number.isInteger(customLength) && customLength >= CUSTOM_MIN && customLength <= CUSTOM_MAX

  if (asking) {
    return (
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          if (customValid) begin(customLength)
        }}
      >
        <Input
          type="number"
          inputMode="numeric"
          min={CUSTOM_MIN}
          max={CUSTOM_MAX}
          value={custom}
          aria-label={t('start.customLabel')}
          className="w-24"
          onChange={(event) => setCustom(event.target.value)}
        />
        <Button type="submit" disabled={!customValid || start.isPending}>
          {t('start.customConfirm')}
        </Button>
      </form>
    )
  }

  const lengths = [usual, ...DURATIONS.filter((length) => length !== usual)]

  return (
    <Menu>
      <MenuTrigger asChild>
        <Button type="button" variant="ghost" className={className} disabled={start.isPending}>
          <Play size={20} aria-hidden="true" />
          {t('start.label')}
        </Button>
      </MenuTrigger>
      <MenuContent>
        {lengths.map((length, position) => (
          <MenuItem key={length} onSelect={() => begin(length)}>
            <span>{t('start.minutes', { minutes: length })}</span>
            {position === 0 ? <span className="text-ink-3">{t('start.usual')}</span> : null}
          </MenuItem>
        ))}
        <MenuSeparator />
        <MenuItem onSelect={() => setAsking(true)}>{t('start.custom')}</MenuItem>
      </MenuContent>
    </Menu>
  )
}
