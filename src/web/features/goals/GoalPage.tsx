import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import type { Goal } from '../../../shared/schemas/goals.ts'
import type { HabitWithWeek } from '../../../shared/schemas/habits.ts'
import { apiFetch } from '../../lib/api.ts'
import { useGoals } from './api.ts'

/** One goal: why it matters, and the habits that carry it this week (PRD F8). */
export function GoalPage() {
  const { t } = useTranslation('goals')
  const { goalId } = useParams({ from: '/goals_/$goalId' })
  const goals = useGoals()
  // Same key as the habits page, so both read one list.
  const habits = useQuery({ queryKey: ['habits'], queryFn: () => apiFetch<HabitWithWeek[]>('/api/habits') })

  if (goals.isPending) return <p className="text-body text-ink-2">{t('loading')}</p>
  const goal: Goal | undefined = goals.data?.find((row) => row.id === goalId)
  if (!goal) return <p className="text-body text-ink-2">{t('loadError')}</p>

  const mine = (habits.data ?? []).filter((habit) => habit.goalId === goal.id && habit.archivedAt === null)

  return (
    <section className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <Link to="/goals" className="text-small text-ink-2 underline hover:text-ink">
          {t('backToGoals')}
        </Link>
        <h1 className="text-title">{goal.title}</h1>
        <p className="text-meta text-ink-3">{t(`status.${goal.status}`)}</p>
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-heading">{t('whyHeading')}</h2>
        <p className="max-w-[65ch] text-body text-ink-2">{goal.why || t('noWhy')}</p>
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-heading">{t('habitsHeading')}</h2>
        {mine.length === 0 ? (
          <p className="text-body text-ink-2">{t('noHabits')}</p>
        ) : (
          <ul className="flex flex-col">
            {mine.map((habit) => (
              <li key={habit.id} className="flex min-h-13 items-center justify-between gap-3 border-b border-line last:border-b-0">
                <span className="text-body text-ink">{habit.name}</span>
                <span className="font-mono text-meta text-ink-3">
                  {t('weekLine', { done: habit.week.done, target: habit.week.target })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
