import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { EmptyState } from '../ui/EmptyState.tsx'

export const Route = createFileRoute('/dump')({
  component: DumpPage,
})

function DumpPage() {
  const { t } = useTranslation('shell')

  return (
    <section className="flex flex-col gap-8 lg:gap-12">
      <h1 className="text-title">{t('dump.title')}</h1>
      <EmptyState title={t('dump.empty')} />
    </section>
  )
}
