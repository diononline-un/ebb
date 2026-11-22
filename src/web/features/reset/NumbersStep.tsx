import { useTranslation } from 'react-i18next'
import type { WeekStats } from '../../../shared/schemas/reset.ts'
import { Button } from '../../ui/Button.tsx'

export type NumbersStepProps = {
  stats: WeekStats
  onNext: () => void
}

/**
 * Step 2: the week in numbers, without a grade (PRD F12, DESIGN §9). Every figure stands next to the
 * thing it counts and is set in the mono face, because these numbers get compared over time.
 */
export function NumbersStep({ stats, onNext }: NumbersStepProps) {
  const { t } = useTranslation('reset')

  return (
    <div className="flex flex-col gap-8">
      <h2 className="text-heading">{t('numbers.question')}</h2>

      <dl className="flex flex-col">
        <NumberRow label={t('numbers.anchorLabel')} value={t('numbers.anchorValue', { done: stats.anchorDays })} />
        <NumberRow label={t('numbers.tasksLabel')} value={t('numbers.tasksValue', { count: stats.tasksDone })} />
        <NumberRow label={t('numbers.focusLabel')} value={t('numbers.focusValue', { count: stats.focusMinutes })} />
        <NumberRow label={t('numbers.rolledLabel')} value={t('numbers.rolledValue', { count: stats.rolledCount })} />
      </dl>

      {stats.habits.length > 0 ? (
        <div className="flex flex-col gap-2">
          <h3 className="text-heading">{t('numbers.habitsHeading')}</h3>
          <dl className="flex flex-col">
            {stats.habits.map((habit) => (
              <NumberRow
                key={habit.habitId}
                label={habit.name}
                value={t('numbers.habitValue', { done: habit.week.done, target: habit.week.target })}
              />
            ))}
          </dl>
        </div>
      ) : null}

      {stats.projects.length > 0 ? (
        <div className="flex flex-col gap-2">
          <h3 className="text-heading">{t('numbers.projectsHeading')}</h3>
          <dl className="flex flex-col">
            {stats.projects.map((project) => (
              <NumberRow
                key={project.projectId}
                label={project.name}
                value={t('numbers.projectValue', { count: project.done })}
              />
            ))}
          </dl>
        </div>
      ) : null}

      <div>
        <Button type="button" variant="secondary" onClick={onNext}>
          {t('numbers.continue')}
        </Button>
      </div>
    </div>
  )
}

/** One figure: what it counts on the left, the count in mono on the right, a line between rows. */
function NumberRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-line py-3 last:border-b-0">
      <dt className="min-w-0 text-small break-words text-ink-2">{label}</dt>
      <dd className="shrink-0 font-mono text-body text-ink">{value}</dd>
    </div>
  )
}
