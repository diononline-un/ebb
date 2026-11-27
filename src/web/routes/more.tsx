import { createFileRoute, Link } from '@tanstack/react-router'
import {
  Bell,
  CalendarCheck,
  ChevronRight,
  CreditCard,
  FolderKanban,
  Repeat,
  ShieldCheck,
  Target,
  Users,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useMe } from '../features/onboarding/api.ts'
import { EmptyState } from '../ui/EmptyState.tsx'

export const Route = createFileRoute('/more')({
  component: MorePage,
})

function MorePage() {
  const { t } = useTranslation('shell')
  // The label lives in the projects namespace: shell.json belongs to the shell package.
  const { t: tProjects } = useTranslation('projects')
  // Same for the reset: its label belongs to the reset package.
  const { t: tReset } = useTranslation('reset')
  // And the spaces: their label belongs to the spaces package.
  const { t: tSpaces } = useTranslation('spaces')
  // The legal pages: their link labels belong to the legal package.
  const { t: tLegal } = useTranslation('legal')
  // The reminders: their label belongs to the settings package.
  const { t: tSettings } = useTranslation('settings')
  // The subscription: its label belongs to the billing package.
  const { t: tBilling } = useTranslation('billing')
  // Self-host has no billing at all (E8-P7), so the entry disappears with it.
  const selfhost = useMe().data?.access.selfhost === true

  return (
    <section className="flex flex-col gap-8 lg:gap-12">
      <h1 className="text-title">{t('more.title')}</h1>
      <ul className="flex flex-col">
        <li className="border-b border-line">
          <Link to="/goals" className="flex min-h-13 items-center gap-3 text-body motion-quick hover:text-ink-2">
            <Target size={20} aria-hidden="true" />
            <span className="flex-1">{t('more.goals')}</span>
            <ChevronRight size={20} aria-hidden="true" className="text-ink-3" />
          </Link>
        </li>
        <li className="border-b border-line">
          <Link to="/habits" className="flex min-h-13 items-center gap-3 text-body motion-quick hover:text-ink-2">
            <Repeat size={20} aria-hidden="true" />
            <span className="flex-1">{t('more.habits')}</span>
            <ChevronRight size={20} aria-hidden="true" className="text-ink-3" />
          </Link>
        </li>
        <li className="border-b border-line">
          <Link to="/projects" className="flex min-h-13 items-center gap-3 text-body motion-quick hover:text-ink-2">
            <FolderKanban size={20} aria-hidden="true" />
            <span className="flex-1">{tProjects('nav')}</span>
            <ChevronRight size={20} aria-hidden="true" className="text-ink-3" />
          </Link>
        </li>
        <li className="border-b border-line">
          <Link to="/reset" className="flex min-h-13 items-center gap-3 text-body motion-quick hover:text-ink-2">
            <CalendarCheck size={20} aria-hidden="true" />
            <span className="flex-1">{tReset('nav')}</span>
            <ChevronRight size={20} aria-hidden="true" className="text-ink-3" />
          </Link>
        </li>
        <li className="border-b border-line">
          <Link to="/spaces" className="flex min-h-13 items-center gap-3 text-body motion-quick hover:text-ink-2">
            <Users size={20} aria-hidden="true" />
            <span className="flex-1">{tSpaces('nav')}</span>
            <ChevronRight size={20} aria-hidden="true" className="text-ink-3" />
          </Link>
        </li>
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
        <li className="border-b border-line">
          <Link
            to="/settings/notifications"
            className="flex min-h-13 items-center gap-3 text-body motion-quick hover:text-ink-2"
          >
            <Bell size={20} aria-hidden="true" />
            <span className="flex-1">{tSettings('nav')}</span>
            <ChevronRight size={20} aria-hidden="true" className="text-ink-3" />
          </Link>
        </li>
        {selfhost ? null : (
          <li className="border-b border-line">
            <Link
              to="/settings/billing"
              className="flex min-h-13 items-center gap-3 text-body motion-quick hover:text-ink-2"
            >
              <CreditCard size={20} aria-hidden="true" />
              <span className="flex-1">{tBilling('nav')}</span>
              <ChevronRight size={20} aria-hidden="true" className="text-ink-3" />
            </Link>
          </li>
        )}
      </ul>
      <EmptyState title={t('more.empty')} />
      <nav aria-label={tLegal('links.label')} className="flex flex-wrap gap-4 text-small text-ink-2">
        <Link to="/legal/$doc" params={{ doc: 'imprint' }} className="hover:text-ink">
          {tLegal('links.imprint')}
        </Link>
        <Link to="/legal/$doc" params={{ doc: 'privacy' }} className="hover:text-ink">
          {tLegal('links.privacy')}
        </Link>
        <Link to="/legal/$doc" params={{ doc: 'terms' }} className="hover:text-ink">
          {tLegal('links.terms')}
        </Link>
      </nav>
    </section>
  )
}
