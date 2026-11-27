import { Link } from '@tanstack/react-router'
import { useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { SettingsPatch } from '../../../shared/schemas/settings.ts'
import { pushSupported, subscribePush, unsubscribePush } from '../../lib/push.ts'
import { Button } from '../../ui/Button.tsx'
import { Checkbox } from '../../ui/Checkbox.tsx'
import { Input } from '../../ui/Input.tsx'
import { usePatchSettings, useSettings } from './api.ts'
import { WeekdayPicker } from './WeekdayPicker.tsx'

/** The iPhone only lets a web app notify once it sits on the home screen (E9-P1). */
function isIosOutsideApp(): boolean {
  if (!/iPhone|iPad|iPod/.test(navigator.userAgent)) return false
  return !window.matchMedia('(display-mode: standalone)').matches
}

/**
 * The push switch of this one browser. The permission prompt may only follow a click, so the state
 * on load is read from the existing subscription and never requested.
 */
function PushBlock() {
  const { t } = useTranslation('settings')
  const [supported] = useState(pushSupported)
  const [subscribed, setSubscribed] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  const [missingKey, setMissingKey] = useState(false)

  useEffect(() => {
    if (!supported) return
    let live = true
    navigator.serviceWorker.ready
      .then((registration) => registration.pushManager.getSubscription())
      .then((subscription) => {
        if (live) setSubscribed(subscription !== null)
      })
      .catch(() => {
        if (live) setSubscribed(false)
      })
    return () => {
      live = false
    }
  }, [supported])

  if (!supported) {
    return (
      <p className="max-w-[65ch] text-small text-ink-2">{isIosOutsideApp() ? t('push.iosHint') : t('push.unsupported')}</p>
    )
  }

  const turnOn = async () => {
    setBusy(true)
    setMissingKey(false)
    try {
      const on = await subscribePush()
      setSubscribed(on)
      // A denied permission is not the server's fault, the browser already said why.
      if (!on && Notification.permission !== 'denied') setMissingKey(true)
    } catch {
      setSubscribed(false)
    } finally {
      setBusy(false)
    }
  }

  const turnOff = async () => {
    setBusy(true)
    try {
      await unsubscribePush()
    } finally {
      setBusy(false)
      setSubscribed(false)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {subscribed === true ? (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-body text-ink">{t('push.on')}</p>
          <Button type="button" variant="ghost" disabled={busy} onClick={() => void turnOff()}>
            {t('push.turnOff')}
          </Button>
        </div>
      ) : null}
      {subscribed === false ? (
        <Button
          type="button"
          variant="secondary"
          className="self-start"
          disabled={busy}
          onClick={() => void turnOn()}
        >
          {t('push.turnOn')}
        </Button>
      ) : null}
      {missingKey ? <p className="max-w-[65ch] text-small text-ink-2">{t('push.missing')}</p> : null}
    </div>
  )
}

type NotifyRowProps = {
  id: string
  label: string
  hint: string
  checked: boolean
  onChange: (checked: boolean) => void
  /** The extra field of this type, indented under the label. */
  children?: ReactNode
}

function NotifyRow({ id, label, hint, checked, onChange, children }: NotifyRowProps) {
  return (
    <div className="flex flex-col gap-2 border-b border-line pb-3">
      <div className="flex items-start gap-3">
        <Checkbox id={id} checked={checked} onCheckedChange={(next) => onChange(next === true)} />
        <div className="flex min-w-0 flex-col">
          <label htmlFor={id} className="text-body text-ink">
            {label}
          </label>
          <p className="max-w-[65ch] text-small text-ink-2">{hint}</p>
        </div>
      </div>
      {children ? <div className="flex flex-col gap-3 pl-12">{children}</div> : null}
    </div>
  )
}

/** E9-P3: every reminder type, the quiet hours, and push for this device. Each change saves at once. */
export function NotificationsPage() {
  const { t } = useTranslation('settings')
  const settings = useSettings()
  const patch = usePatchSettings()
  const [failed, setFailed] = useState(false)

  const save = async (body: SettingsPatch) => {
    setFailed(false)
    try {
      await patch.mutateAsync(body)
    } catch {
      setFailed(true)
    }
  }

  if (settings.isPending) return <p className="text-body text-ink-2">{t('loading')}</p>
  if (!settings.data) return <p className="text-body text-ink-2">{t('loadError')}</p>

  const view = settings.data

  return (
    <section className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <h1 className="text-title">{t('title')}</h1>
        <PushBlock />
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-heading">{t('types.title')}</h2>

        <NotifyRow
          id="notify-morning"
          label={t('types.morning')}
          hint={t('types.morningHint')}
          checked={view.notify.morning}
          onChange={(on) => void save({ notify: { morning: on } })}
        >
          <div className="flex flex-col gap-1">
            <label htmlFor="settings-morning-time" className="text-small text-ink-2">
              {t('types.morningTime')}
            </label>
            <Input
              id="settings-morning-time"
              type="time"
              value={view.morningReminder ?? ''}
              onChange={(event) => void save({ morningReminder: event.target.value || null })}
            />
          </div>
        </NotifyRow>

        <NotifyRow
          id="notify-weekly-reset"
          label={t('types.weeklyReset')}
          hint={t('types.weeklyResetHint')}
          checked={view.notify.weeklyReset}
          onChange={(on) => void save({ notify: { weeklyReset: on } })}
        >
          <WeekdayPicker
            label={t('types.weeklyResetDay')}
            value={view.weeklyResetDow}
            onChange={(day) => {
              if (day !== null) void save({ weeklyResetDow: day })
            }}
          />
          <div className="flex flex-col gap-1">
            <label htmlFor="settings-weekly-reset-time" className="text-small text-ink-2">
              {t('types.weeklyResetTime')}
            </label>
            <Input
              id="settings-weekly-reset-time"
              type="time"
              value={view.weeklyResetTime}
              onChange={(event) => {
                if (event.target.value) void save({ weeklyResetTime: event.target.value })
              }}
            />
          </div>
        </NotifyRow>

        <NotifyRow
          id="notify-errands"
          label={t('types.errands')}
          hint={t('types.errandsHint')}
          checked={view.notify.errands}
          onChange={(on) => void save({ notify: { errands: on } })}
        >
          <WeekdayPicker
            allowNone
            label={t('types.errandsDay')}
            value={view.errandsDow}
            onChange={(day) => void save({ errandsDow: day })}
          />
        </NotifyRow>

        <NotifyRow
          id="notify-habits"
          label={t('types.habits')}
          hint={t('types.habitsHint')}
          checked={view.notify.habits}
          onChange={(on) => void save({ notify: { habits: on } })}
        >
          <Link to="/habits" className="self-start text-small text-ink-2 underline hover:text-ink">
            {t('types.habitsLink')}
          </Link>
        </NotifyRow>

        <NotifyRow
          id="notify-timer"
          label={t('types.timer')}
          hint={t('types.timerHint')}
          checked={view.notify.timer}
          onChange={(on) => void save({ notify: { timer: on } })}
        />

        <NotifyRow
          id="notify-trial"
          label={t('types.trial')}
          hint={t('types.trialHint')}
          checked={view.notify.trial}
          onChange={(on) => void save({ notify: { trial: on } })}
        />
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-heading">{t('quiet.title')}</h2>
        <div className="flex flex-wrap gap-3">
          <div className="flex min-w-32 flex-1 flex-col gap-1">
            <label htmlFor="settings-quiet-start" className="text-small text-ink-2">
              {t('quiet.start')}
            </label>
            <Input
              id="settings-quiet-start"
              type="time"
              value={view.quietStart}
              onChange={(event) => {
                if (event.target.value) void save({ quietStart: event.target.value })
              }}
            />
          </div>
          <div className="flex min-w-32 flex-1 flex-col gap-1">
            <label htmlFor="settings-quiet-end" className="text-small text-ink-2">
              {t('quiet.end')}
            </label>
            <Input
              id="settings-quiet-end"
              type="time"
              value={view.quietEnd}
              onChange={(event) => {
                if (event.target.value) void save({ quietEnd: event.target.value })
              }}
            />
          </div>
        </div>
        <p className="max-w-[65ch] text-small text-ink-2">{t('quiet.hint')}</p>
      </div>

      {failed ? (
        <p role="alert" className="text-small text-danger">
          {t('errors.generic')}
        </p>
      ) : null}
    </section>
  )
}
