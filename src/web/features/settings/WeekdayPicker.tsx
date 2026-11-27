import { useTranslation } from 'react-i18next'
import { Button } from '../../ui/Button.tsx'

// Monday first, like the week in the rest of the app. The numbers follow the schema: 0 = Sunday.
const WEEK = [1, 2, 3, 4, 5, 6, 0] as const

export type WeekdayPickerProps = {
  /** The day that is on, 0 = Sunday; null only when `allowNone` is set and the setting is off. */
  value: number | null
  onChange: (value: number | null) => void
  /** Accessible name of the group. */
  label: string
  /** Adds a "None" choice that sends null, for the errand day that may be off. */
  allowNone?: boolean
}

export function WeekdayPicker({ value, onChange, label, allowNone = false }: WeekdayPickerProps) {
  const { t, i18n } = useTranslation('settings')
  // Names come from the locale instead of a key table, like the habit weekdays.
  const format = new Intl.DateTimeFormat(i18n.language, { weekday: 'short', timeZone: 'UTC' })
  const shortDay = (day: number) => format.format(new Date(Date.UTC(2026, 10, 15 + day)))

  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2">
      {WEEK.map((day) => (
        <Button
          key={day}
          type="button"
          variant={value === day ? 'secondary' : 'ghost'}
          aria-pressed={value === day}
          onClick={() => onChange(day)}
        >
          {shortDay(day)}
        </Button>
      ))}
      {allowNone ? (
        <Button
          type="button"
          variant={value === null ? 'secondary' : 'ghost'}
          aria-pressed={value === null}
          onClick={() => onChange(null)}
        >
          {t('weekdays.none')}
        </Button>
      ) : null}
    </div>
  )
}
