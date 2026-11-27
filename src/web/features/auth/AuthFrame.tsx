import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

export type AuthFrameProps = {
  title: string
  children: ReactNode
  footer?: ReactNode
}

/** Auth screens stand alone: no navigation bar, one column, everything within thumb reach. */
export function AuthFrame({ title, children, footer }: AuthFrameProps) {
  const { t } = useTranslation('legal')
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-content flex-col justify-center gap-8 px-4 py-12">
      <h1 className="text-title">{title}</h1>
      {children}
      {footer ? <div className="flex flex-col gap-3 text-small text-ink-2">{footer}</div> : null}
      <nav aria-label={t('links.label')} className="flex flex-wrap gap-4 text-small text-ink-2">
        <Link to="/legal/$doc" params={{ doc: 'imprint' }} className="hover:text-ink">
          {t('links.imprint')}
        </Link>
        <Link to="/legal/$doc" params={{ doc: 'privacy' }} className="hover:text-ink">
          {t('links.privacy')}
        </Link>
        <Link to="/legal/$doc" params={{ doc: 'terms' }} className="hover:text-ink">
          {t('links.terms')}
        </Link>
      </nav>
    </main>
  )
}
