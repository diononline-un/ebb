import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { EmptyState } from '../ui/EmptyState.tsx'

export const Route = createFileRoute('/plan')({
  component: PlanPage,
})

function PlanPage() {
  const { t } = useTranslation('shell')

  return (
    <section className="flex flex-col gap-8 lg:gap-12">
      <h1 className="text-title">{t('plan.title')}</h1>
      <EmptyState title={t('plan.empty')} />
    </section>
  )
}
