import { Link } from '@tanstack/react-router'
import { CalendarDays, Menu as MenuIcon, NotebookPen, Plus, Sun, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '../../lib/cn.ts'
import { InstallHint } from './InstallHint.tsx'

type NavEntry = {
  to: '/today' | '/dump' | '/plan' | '/more'
  labelKey: string
  icon: LucideIcon
}

const NAV_ENTRIES: NavEntry[] = [
  { to: '/today', labelKey: 'nav.today', icon: Sun },
  { to: '/dump', labelKey: 'nav.dump', icon: NotebookPen },
  { to: '/plan', labelKey: 'nav.plan', icon: CalendarDays },
  { to: '/more', labelKey: 'nav.more', icon: MenuIcon },
]

function NavLinks({ layout }: { layout: 'bar' | 'rail' }) {
  const { t } = useTranslation('shell')

  return (
    <ul className={layout === 'bar' ? 'flex flex-1 items-stretch' : 'mt-4 flex flex-col gap-1'}>
      {NAV_ENTRIES.map((entry) => (
        <li key={entry.to} className={layout === 'bar' ? 'flex flex-1' : undefined}>
          <Link
            to={entry.to}
            className={cn(
              // Weight as a second cue next to colour, so the active tab never relies on colour alone (WCAG 1.4.1).
              'motion-quick text-ink-3 hover:text-ink data-[status=active]:font-bold data-[status=active]:text-ink',
              layout === 'bar'
                ? 'flex flex-1 flex-col items-center justify-center gap-1 py-2 text-meta'
                : 'flex min-h-11 items-center gap-3 rounded-control px-3 text-body hover:bg-surface-2',
            )}
          >
            <entry.icon size={24} aria-hidden="true" />
            <span>{t(entry.labelKey)}</span>
          </Link>
        </li>
      ))}
    </ul>
  )
}

export function AppShell({ children }: { children: ReactNode }) {
  const { t } = useTranslation('shell')

  return (
    <div className="min-h-dvh lg:flex">
      <aside className="hidden shrink-0 border-r border-line p-6 lg:flex lg:w-60 lg:flex-col">
        <span className="text-heading">{t('common:app.name')}</span>
        <NavLinks layout="rail" />
      </aside>

      <main className="mx-auto w-full max-w-content px-4 pt-6 pb-24 lg:pt-12 lg:pb-12">
        {children}
        <InstallHint />
      </main>

      {/* Quick capture: the sheet it opens arrives in E2-P6. */}
      <button
        type="button"
        aria-label={t('quickCapture')}
        className="fixed right-4 bottom-24 flex size-14 items-center justify-center rounded-pill bg-signal text-signal-ink shadow-float motion-quick hover:bg-signal-hover lg:hidden"
      >
        <Plus size={24} aria-hidden="true" />
      </button>

      <nav
        aria-label={t('nav.label')}
        className="fixed inset-x-0 bottom-0 border-t border-line bg-ground lg:hidden"
      >
        <NavLinks layout="bar" />
      </nav>
    </div>
  )
}
