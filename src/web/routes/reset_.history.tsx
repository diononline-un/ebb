import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

// reset_ keeps the history page out of the reset flow's layout: /reset/history is its own page.
export const Route = createFileRoute('/reset_/history')({
  component: ResetHistoryPage,
})

function ResetHistoryPage() {
  const { t } = useTranslation('reset')

  return (
    <section className="flex flex-col gap-8">
      <h1 className="text-title">{t('history.title')}</h1>
      <p className="max-w-[65ch] text-body text-ink-2">{t('history.empty')}</p>
    </section>
  )
}
