import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Task } from '../../../shared/schemas/task.ts'
import { ApiError } from '../../lib/api.ts'
import { shortDay } from '../habits/rhythm.ts'
import { Button } from '../../ui/Button.tsx'
import { Checkbox } from '../../ui/Checkbox.tsx'
import { Input } from '../../ui/Input.tsx'
import { useCreateRecurrence, useRecurrences, useToday, type RecurrenceRule } from './api.ts'

const FREQS: RecurrenceRule['freq'][] = ['daily', 'weekdays', 'weekly', 'every_n_days', 'monthly']

/** The rule as the field stands; null while a part is missing (a weekly without days, an empty number). */
function ruleOf(
  freq: RecurrenceRule['freq'],
  weekdays: number[],
  intervalDays: string,
  monthDay: string,
): RecurrenceRule | null {
  if (freq === 'weekly') {
    return weekdays.length === 0 ? null : { freq, weekdays: [...weekdays].sort((left, right) => left - right) }
  }
  if (freq === 'every_n_days') {
    const interval = Number(intervalDays)
    return Number.isInteger(interval) && interval >= 2 && interval <= 365 ? { freq, interval } : null
  }
  if (freq === 'monthly') {
    const day = Number(monthDay)
    return Number.isInteger(day) && day >= 1 && day <= 31 ? { freq, monthDay: day } : null
  }
  return { freq }
}

export type RecurrenceFieldProps = {
  task: Task
}

/** The repeat section of the task sheet (E5): the rules this task came from, and a new one from today. */
export function RecurrenceField({ task }: RecurrenceFieldProps) {
  const { t, i18n } = useTranslation('tasks-extra')
  const recurrences = useRecurrences()
  const create = useCreateRecurrence()
  const day = useToday()
  const [freq, setFreq] = useState<RecurrenceRule['freq']>('daily')
  const [weekdays, setWeekdays] = useState<number[]>([])
  const [intervalDays, setIntervalDays] = useState('3')
  const [monthDay, setMonthDay] = useState('1')
  const [error, setError] = useState<string | null>(null)

  const today = day.data?.date ?? ''
  const rule = ruleOf(freq, weekdays, intervalDays, monthDay)
  const mine = (recurrences.data ?? []).filter((entry) => entry.id === task.recurrenceId)

  const describe = (entry: RecurrenceRule): string => {
    if (entry.freq === 'weekly') {
      return t('repeat.rule.weekly', {
        days: entry.weekdays.map((day) => shortDay(day, i18n.language)).join(', '),
      })
    }
    if (entry.freq === 'every_n_days') return t('repeat.rule.every_n_days', { interval: entry.interval })
    if (entry.freq === 'monthly') return t('repeat.rule.monthly', { day: entry.monthDay })
    return t(`repeat.rule.${entry.freq}`)
  }

  const toggleDay = (value: number) => {
    setWeekdays((current) =>
      current.includes(value) ? current.filter((entry) => entry !== value) : [...current, value],
    )
  }

  const save = async () => {
    if (!rule || !today) return
    setError(null)

    try {
      await create.mutateAsync({
        title: task.title,
        rule,
        startsOn: today,
        ...(task.projectId ? { projectId: task.projectId } : {}),
      })
    } catch (failure) {
      const code = failure instanceof ApiError ? failure.code : 'generic'
      setError(t(`errors.${code}`, { defaultValue: t('errors.generic') }))
    }
  }

  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-heading">{t('repeat.heading')}</h3>

      {mine.length === 0 ? (
        <p className="text-small text-ink-2">{t('repeat.empty')}</p>
      ) : (
        <ul className="flex flex-col">
          {mine.map((entry) => (
            <li key={entry.id} className="min-h-11 py-2 text-body text-ink">
              {describe(entry.rule)}
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-col gap-1">
        <label htmlFor="repeat-freq" className="text-small text-ink-2">
          {t('repeat.freqLabel')}
        </label>
        <select
          id="repeat-freq"
          value={freq}
          onChange={(event) => setFreq(event.target.value as RecurrenceRule['freq'])}
          className="min-h-11 rounded-control border border-line bg-surface-sunken px-3 text-body text-ink"
        >
          {FREQS.map((value) => (
            <option key={value} value={value}>
              {t(`repeat.freq.${value}`)}
            </option>
          ))}
        </select>
      </div>

      {freq === 'weekly' ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="text-small text-ink-2">{t('repeat.weekdaysLabel')}</legend>
          <div className="flex flex-wrap gap-2">
            {[0, 1, 2, 3, 4, 5, 6].map((value) => (
              <label key={value} className="flex min-h-11 items-center gap-2 text-body text-ink">
                <Checkbox checked={weekdays.includes(value)} onCheckedChange={() => toggleDay(value)} />
                <span>{shortDay(value, i18n.language)}</span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}

      {freq === 'every_n_days' ? (
        <div className="flex flex-col gap-1">
          <label htmlFor="repeat-interval" className="text-small text-ink-2">
            {t('repeat.intervalLabel')}
          </label>
          <Input
            id="repeat-interval"
            type="number"
            inputMode="numeric"
            min={2}
            max={365}
            value={intervalDays}
            className="w-24"
            onChange={(event) => setIntervalDays(event.target.value)}
          />
        </div>
      ) : null}

      {freq === 'monthly' ? (
        <div className="flex flex-col gap-1">
          <label htmlFor="repeat-month-day" className="text-small text-ink-2">
            {t('repeat.monthDayLabel')}
          </label>
          <Input
            id="repeat-month-day"
            type="number"
            inputMode="numeric"
            min={1}
            max={31}
            value={monthDay}
            className="w-24"
            onChange={(event) => setMonthDay(event.target.value)}
          />
        </div>
      ) : null}

      <p className="text-meta text-ink-3">{t('repeat.startHint')}</p>
      <Button type="button" variant="secondary" disabled={rule === null || !today} onClick={() => void save()}>
        {t('repeat.add')}
      </Button>

      {error ? (
        <p role="alert" className="text-small text-danger">
          {error}
        </p>
      ) : null}
    </section>
  )
}
