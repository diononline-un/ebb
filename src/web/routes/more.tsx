import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { EmptyState } from '../ui/EmptyState.tsx'

export const Route = createFileRoute('/more')({
  component: MorePage,
})

function MorePage() {
  const { t } = useTranslation('shell')

  return (
    <section className="flex flex-col gap-8 lg:gap-12">
      <h1 className="text-title">{t('more.title')}</h1>
      <EmptyState title={t('more.empty')} />
    </section>
  )
}
