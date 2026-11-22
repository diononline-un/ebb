import { Link } from '@tanstack/react-router'
import { ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Goal } from '../../../shared/schemas/goals.ts'
import { Button } from '../../ui/Button.tsx'
import { useGoals } from './api.ts'
import { GoalSheet } from './GoalSheet.tsx'

/** The goals list (More → Goals). No ring, no percentage: the numbers belong to the habits. */
export function GoalsPage() {
  const { t } = useTranslation('goals')
  const goals = useGoals()
  const [editing, setEditing] = useState<Goal | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)

  const openSheet = (goal: Goal | null) => {
    setEditing(goal)
    setSheetOpen(true)
  }

  if (goals.isPending) return <p className="text-body text-ink-2">{t('loading')}</p>
  if (!goals.data) return <p className="text-body text-ink-2">{t('loadError')}</p>

  return (
    <section className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-title">{t('title')}</h1>
        <Button type="button" variant="secondary" onClick={() => openSheet(null)}>
          {t('add')}
        </Button>
      </div>

      {goals.data.length === 0 ? <p className="max-w-[65ch] text-body text-ink-2">{t('empty')}</p> : null}

      <ul className="flex flex-col">
        {goals.data.map((goal) => (
          <li key={goal.id} className="border-b border-line last:border-b-0">
            <div className="flex items-center gap-3">
              <Link
                to="/goals/$goalId"
                params={{ goalId: goal.id }}
                className="flex min-h-13 flex-1 flex-col justify-center py-2 motion-quick hover:text-ink-2"
              >
                <span className="text-body text-ink">{goal.title}</span>
                <span className="text-meta text-ink-3">{t(`status.${goal.status}`)}</span>
              </Link>
              <button
                type="button"
                className="min-h-11 rounded-control px-3 text-small text-ink-2 motion-quick hover:bg-surface-sunken hover:text-ink"
                onClick={() => openSheet(goal)}
              >
                {t('sheet.editTitle')}
              </button>
              <ChevronRight size={20} aria-hidden="true" className="text-ink-3" />
            </div>
          </li>
        ))}
      </ul>

      <GoalSheet key={editing?.id ?? 'new'} open={sheetOpen} onOpenChange={setSheetOpen} goal={editing} />
    </section>
  )
}
