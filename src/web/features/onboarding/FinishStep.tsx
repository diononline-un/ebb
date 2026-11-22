import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../../ui/Button.tsx'
import { Input } from '../../ui/Input.tsx'
import { patchSettings, type OnboardingSettings } from './api.ts'

export type FinishStepProps = {
  settings: OnboardingSettings
  /** Called after the last answer is saved; the page then finishes the onboarding. */
  onDone: () => void
}

/** Step 8: when the day starts and when the week gets its reset. Push itself comes with E9. */
export function FinishStep({ settings, onDone }: FinishStepProps) {
  const { t, i18n } = useTranslation('onboarding')
  const [morning, setMorning] = useState(settings.morningReminder ?? '08:00')
  const [resetDow, setResetDow] = useState(String(settings.weeklyResetDow))
  const [resetTime, setResetTime] = useState(settings.weeklyResetTime)
  const [busy, setBusy] = useState(false)

  const dayFormat = new Intl.DateTimeFormat(i18n.language, { weekday: 'long', timeZone: 'UTC' })
  const shortFormat = new Intl.DateTimeFormat(i18n.language, { weekday: 'short', timeZone: 'UTC' })
  const dayName = (day: number) => dayFormat.format(new Date(Date.UTC(2026, 10, 15 + day)))
  const shortDay = (day: number) => shortFormat.format(new Date(Date.UTC(2026, 10, 15 + day)))

  // The iPhone only lets a web app notify once it sits on the home screen (E9 brings the push).
  const isIos = typeof navigator !== 'undefined' && /iPhone|iPad|iPod/.test(navigator.userAgent)

  const finish = async () => {
    setBusy(true)
    try {
      await patchSettings({
        morningReminder: morning || null,
        weeklyResetDow: Number(resetDow),
        weeklyResetTime: resetTime,
      })
      onDone()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-6">
      <p className="text-question">{t('rituals.question')}</p>

      <div className="flex flex-col gap-1">
        <label htmlFor="onboarding-morning" className="text-small text-ink-2">
          {t('rituals.morningLabel')}
        </label>
        <Input
          id="onboarding-morning"
          type="time"
          value={morning}
          onChange={(event) => setMorning(event.target.value)}
        />
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-1 flex-col gap-1">
          <label htmlFor="onboarding-reset-day" className="text-small text-ink-2">
            {t('rituals.resetDayLabel')}
          </label>
          <select
            id="onboarding-reset-day"
            value={resetDow}
            onChange={(event) => setResetDow(event.target.value)}
            className="min-h-11 rounded-control border border-line bg-surface-sunken px-3 text-body text-ink"
          >
            {[0, 1, 2, 3, 4, 5, 6].map((day) => (
              <option key={day} value={day}>
                {dayName(day)}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="onboarding-reset-time" className="text-small text-ink-2">
            {t('rituals.resetTimeLabel')}
          </label>
          <Input
            id="onboarding-reset-time"
            type="time"
            value={resetTime}
            onChange={(event) => setResetTime(event.target.value)}
          />
        </div>
      </div>

      <p className="max-w-[65ch] text-small text-ink-2">
        {isIos ? t('rituals.iosHint') : t('rituals.reminderHint', { day: shortDay(Number(resetDow)) })}
      </p>

      <div className="mt-auto flex flex-wrap gap-2">
        <Button type="button" className="min-h-14" disabled={busy} onClick={() => void finish()}>
          {t('rituals.finish')}
        </Button>
        <Button type="button" variant="ghost" className="min-h-14" onClick={onDone}>
          {t('rituals.skip')}
        </Button>
      </div>
    </div>
  )
}
