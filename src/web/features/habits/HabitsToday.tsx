import { useTranslation } from 'react-i18next'
import type { HabitToday } from '../../../shared/schemas/habits.ts'
import { cn } from '../../lib/cn.ts'
import { Checkbox } from '../../ui/Checkbox.tsx'
import { useClearHabit, useHabitsToday, useLogHabit } from './api.ts'

export type HabitsTodayProps = {
  habits: HabitToday[]
  /** Ticks the habit off for today, or takes the tick back. */
  onToggle: (habit: HabitToday) => void
}

/** "Habits today" on Today (DESIGN §5): one tap per habit, the week stand in mono and without blame. */
export function HabitsToday({ habits, onToggle }: HabitsTodayProps) {
  const { t } = useTranslation('habits')

  if (habits.length === 0) return null

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-heading">{t('todayHeading')}</h2>
      <ul className="flex flex-col">
        {habits.map((habit) => (
          <li key={habit.id} className="flex min-h-13 items-start gap-1 border-b border-line py-1 last:border-b-0">
            <Checkbox
              checked={habit.doneToday}
              aria-label={t(habit.doneToday ? 'markOpen' : 'markDone', { name: habit.name })}
              onCheckedChange={() => onToggle(habit)}
            />
            <span className="flex flex-1 flex-col py-2">
              <span className={cn('text-body break-words', habit.doneToday ? 'text-ink-3 line-through' : 'text-ink')}>
                {habit.name}
              </span>
              <span className="font-mono text-meta text-ink-3">
                {t('weekLine', { done: habit.week.done, target: habit.week.target })}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** Today's section: loads the habits of the day and ticks them off. Nothing due means no line. */
export function HabitsSection() {
  const query = useHabitsToday()
  const log = useLogHabit()
  const clear = useClearHabit()

  if (!query.data) return null

  const date = query.data.date
  const toggle = (habit: HabitToday) => {
    const input = { id: habit.id, date }
    if (habit.doneToday) clear.mutate(input)
    else log.mutate(input)
  }

  return <HabitsToday habits={query.data.habits} onToggle={toggle} />
}
