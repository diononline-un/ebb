import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Goal } from '../../../shared/schemas/goals.ts'
import type { Cadence, HabitWithWeek } from '../../../shared/schemas/habits.ts'
import { ApiError } from '../../lib/api.ts'
import { Button } from '../../ui/Button.tsx'
import { Checkbox } from '../../ui/Checkbox.tsx'
import { Input } from '../../ui/Input.tsx'
import { Sheet } from '../../ui/Sheet.tsx'
import { useCreateHabit, usePatchHabit } from './api.ts'
import { shortDay } from './rhythm.ts'

export type HabitSheetProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The habit being edited, or null to create one. */
  habit: HabitWithWeek | null
  goals: Goal[]
}

/** Everything a habit is made of (PRD F9): name, goal, rhythm, days, reminder. */
export function HabitSheet({ open, onOpenChange, habit, goals }: HabitSheetProps) {
  const { t, i18n } = useTranslation('habits')
  const create = useCreateHabit()
  const patch = usePatchHabit()
  const [name, setName] = useState(habit?.name ?? '')
  const [goalId, setGoalId] = useState(habit?.goalId ?? '')
  const [cadence, setCadence] = useState<Cadence>(habit?.cadence ?? 'daily')
  const [weeklyTarget, setWeeklyTarget] = useState(String(habit?.weeklyTarget ?? 3))
  const [weekdays, setWeekdays] = useState<number[]>(habit?.weekdays ?? [])
  const [reminderTime, setReminderTime] = useState(habit?.reminderTime ?? '')
  const [error, setError] = useState<string | null>(null)

  const save = async () => {
    setError(null)
    const target = Number(weeklyTarget)
    const days = cadence === 'daily' && weekdays.length > 0 ? [...weekdays].sort((a, b) => a - b) : null
    const weekly = cadence === 'weekly_count' ? target : null

    try {
      if (habit) {
        await patch.mutateAsync({
          id: habit.id,
          patch: {
            name: name.trim(),
            goalId: goalId || null,
            cadence,
            weeklyTarget: weekly,
            weekdays: days,
            reminderTime: reminderTime || null,
          },
        })
      } else {
        await create.mutateAsync({
          name: name.trim(),
          cadence,
          ...(goalId ? { goalId } : {}),
          ...(weekly === null ? {} : { weeklyTarget: weekly }),
          ...(days === null ? {} : { weekdays: days }),
          ...(reminderTime ? { reminderTime } : {}),
        })
      }
      onOpenChange(false)
    } catch (failure) {
      const code = failure instanceof ApiError ? failure.code : 'generic'
      setError(t(`errors.${code}`, { defaultValue: t('errors.generic') }))
    }
  }

  const archive = async () => {
    if (!habit) return
    await patch.mutateAsync({ id: habit.id, patch: { archived: habit.archivedAt === null } })
    onOpenChange(false)
  }

  const toggleDay = (day: number) => {
    setWeekdays((current) => (current.includes(day) ? current.filter((value) => value !== day) : [...current, day]))
  }

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={habit ? t('sheet.editTitle') : t('sheet.createTitle')}
      footer={
        <>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            {t('sheet.cancel')}
          </Button>
          <Button type="button" disabled={!name.trim()} onClick={() => void save()}>
            {t('sheet.save')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="habit-name" className="text-small text-ink-2">
            {t('sheet.nameLabel')}
          </label>
          <Input id="habit-name" value={name} maxLength={80} onChange={(event) => setName(event.target.value)} />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="habit-goal" className="text-small text-ink-2">
            {t('sheet.goalLabel')}
          </label>
          <select
            id="habit-goal"
            value={goalId}
            onChange={(event) => setGoalId(event.target.value)}
            className="min-h-11 rounded-control border border-line bg-surface-sunken px-3 text-body text-ink"
          >
            <option value="">{t('sheet.goalNone')}</option>
            {goals.map((goal) => (
              <option key={goal.id} value={goal.id}>
                {goal.title}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="habit-cadence" className="text-small text-ink-2">
            {t('sheet.cadenceLabel')}
          </label>
          <select
            id="habit-cadence"
            value={cadence}
            onChange={(event) => setCadence(event.target.value as Cadence)}
            className="min-h-11 rounded-control border border-line bg-surface-sunken px-3 text-body text-ink"
          >
            <option value="daily">{t('sheet.cadenceDaily')}</option>
            <option value="weekly_count">{t('sheet.cadenceWeekly')}</option>
          </select>
        </div>

        {cadence === 'weekly_count' ? (
          <div className="flex flex-col gap-1">
            <label htmlFor="habit-target" className="text-small text-ink-2">
              {t('sheet.targetLabel')}
            </label>
            <Input
              id="habit-target"
              type="number"
              inputMode="numeric"
              min={1}
              max={7}
              value={weeklyTarget}
              className="w-24"
              onChange={(event) => setWeeklyTarget(event.target.value)}
            />
          </div>
        ) : (
          <fieldset className="flex flex-col gap-2">
            <legend className="text-small text-ink-2">{t('sheet.weekdaysLabel')}</legend>
            <div className="flex flex-wrap gap-2">
              {[0, 1, 2, 3, 4, 5, 6].map((day) => (
                <label key={day} className="flex min-h-11 items-center gap-2 text-body text-ink">
                  <Checkbox checked={weekdays.includes(day)} onCheckedChange={() => toggleDay(day)} />
                  <span>{shortDay(day, i18n.language)}</span>
                </label>
              ))}
            </div>
          </fieldset>
        )}

        <div className="flex flex-col gap-1">
          <label htmlFor="habit-reminder" className="text-small text-ink-2">
            {t('sheet.reminderLabel')}
          </label>
          <Input
            id="habit-reminder"
            type="time"
            value={reminderTime}
            onChange={(event) => setReminderTime(event.target.value)}
          />
        </div>

        {error ? (
          <p role="alert" className="text-small text-danger">
            {error}
          </p>
        ) : null}

        {habit ? (
          <Button type="button" variant="ghost" onClick={() => void archive()}>
            {habit.archivedAt === null ? t('sheet.archive') : t('sheet.restore')}
          </Button>
        ) : null}
      </div>
    </Sheet>
  )
}
