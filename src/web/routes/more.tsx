import { createFileRoute, Link } from '@tanstack/react-router'
import { ChevronRight, ShieldCheck } from 'lucide-react'
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
      <ul className="flex flex-col">
        <li className="border-b border-line">
          <Link
            to="/settings/security"
            className="flex min-h-13 items-center gap-3 text-body motion-quick hover:text-ink-2"
          >
            <ShieldCheck size={20} aria-hidden="true" />
            <span className="flex-1">{t('more.security')}</span>
            <ChevronRight size={20} aria-hidden="true" className="text-ink-3" />
          </Link>
        </li>
      </ul>
      <EmptyState title={t('more.empty')} />
    </section>
  )
}
