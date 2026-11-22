import { useQuery } from '@tanstack/react-query'
import { Pencil } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { addDays } from '../../../shared/day.ts'
import type { Goal } from '../../../shared/schemas/goals.ts'
import type { HabitWithWeek } from '../../../shared/schemas/habits.ts'
import { apiFetch } from '../../lib/api.ts'
import { Button } from '../../ui/Button.tsx'
import { IconButton } from '../../ui/IconButton.tsx'
import { useClearHabit, useHabits, useHabitsToday, useLogHabit } from './api.ts'
import { HabitSheet } from './HabitSheet.tsx'
import { shortDay } from './rhythm.ts'

/** The habit list (More → Habits): rhythm, week stand, and the ticks for today and yesterday. */
export function HabitsPage() {
  const { t, i18n } = useTranslation('habits')
  const habits = useHabits()
  const today = useHabitsToday()
  const goals = useQuery({ queryKey: ['goals'], queryFn: () => apiFetch<Goal[]>('/api/goals') })
  const log = useLogHabit()
  const clear = useClearHabit()
  const [editing, setEditing] = useState<HabitWithWeek | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)

  const openSheet = (habit: HabitWithWeek | null) => {
    setEditing(habit)
    setSheetOpen(true)
  }

  const day = today.data?.date ?? null
  const yesterday = day ? addDays(day, -1) : null

  const toggle = (habit: HabitWithWeek, date: string, done: boolean) => {
    const input = { id: habit.id, date }
    if (done) clear.mutate(input)
    else log.mutate(input)
  }

  const rhythmOf = (habit: HabitWithWeek) => {
    if (habit.cadence === 'weekly_count') return t('rhythm.weekly', { count: habit.weeklyTarget ?? 7 })
    if (!habit.weekdays || habit.weekdays.length === 0) return t('rhythm.daily')
    return habit.weekdays.map((weekday) => shortDay(weekday, i18n.language)).join(', ')
  }

  if (habits.isPending) return <p className="text-body text-ink-2">{t('loading')}</p>
  if (!habits.data) return <p className="text-body text-ink-2">{t('loadError')}</p>

  return (
    <section className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-title">{t('title')}</h1>
        <Button type="button" variant="secondary" onClick={() => openSheet(null)}>
          {t('add')}
        </Button>
      </div>

      {habits.data.length === 0 ? <p className="max-w-[65ch] text-body text-ink-2">{t('empty')}</p> : null}

      <ul className="flex flex-col">
        {habits.data.map((habit) => (
          <li key={habit.id} className="flex flex-col gap-2 border-b border-line py-3 last:border-b-0">
            <div className="flex items-start justify-between gap-3">
              <div className="flex flex-col">
                <span className="text-body text-ink">{habit.name}</span>
                <span className="text-meta text-ink-3">{rhythmOf(habit)}</span>
                <span className="font-mono text-meta text-ink-3">
                  {habit.archivedAt ? t('sheet.archivedLine') : t('weekLine', { done: habit.week.done, target: habit.week.target })}
                </span>
              </div>
              <IconButton label={t('edit', { name: habit.name })} onClick={() => openSheet(habit)}>
                <Pencil size={20} aria-hidden="true" />
              </IconButton>
            </div>

            {habit.archivedAt === null && day && yesterday ? (
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant={habit.doneToday ? 'secondary' : 'ghost'}
                  onClick={() => toggle(habit, day, habit.doneToday)}
                >
                  {habit.doneToday ? t('sheet.todayDone') : t('sheet.todayOpen')}
                </Button>
                <Button
                  type="button"
                  variant={habit.doneYesterday ? 'secondary' : 'ghost'}
                  onClick={() => toggle(habit, yesterday, habit.doneYesterday)}
                >
                  {habit.doneYesterday ? t('sheet.yesterdayDone') : t('sheet.yesterdayOpen')}
                </Button>
              </div>
            ) : null}
          </li>
        ))}
      </ul>

      <HabitSheet
        key={editing?.id ?? 'new'}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        habit={editing}
        goals={goals.data ?? []}
      />
    </section>
  )
}
