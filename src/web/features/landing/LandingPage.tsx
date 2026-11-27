import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { Button } from '../../ui/Button.tsx'
import { TideLine } from '../../ui/TideLine.tsx'

/** The four morning steps in the order a morning runs; the sorting question is part of the last one. */
const MORNING_STEPS = ['energy', 'yesterday', 'thoughts', 'questions'] as const
const FAQ = ['app', 'data', 'export', 'trial', 'adhd'] as const
const LEGAL_DOCS = ['imprint', 'privacy', 'terms'] as const

/** The public landing page: one column, one h1, and the tide line as the only picture (DESIGN §6). */
export function LandingPage() {
  const { t } = useTranslation('landing')
  const { t: tLegal } = useTranslation('legal')

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-content flex-col px-4">
      <header className="flex items-center justify-between gap-4 py-6">
        <span className="text-heading">{t('common:app.name')}</span>
        <Link to="/sign-in" className="text-body text-ink-2 hover:text-ink">
          {t('header.signIn')}
        </Link>
      </header>

      <main className="flex flex-col gap-12 pb-12">
        <section className="flex flex-col gap-4">
          <h1 className="max-w-[65ch] text-title">{t('hero.title')}</h1>
          <p className="max-w-[65ch] text-body text-ink-2">{t('hero.line')}</p>
          <div className="flex flex-col items-start gap-2">
            <Button asChild>
              <Link to="/sign-up">{t('hero.cta')}</Link>
            </Button>
            <span className="text-small text-ink-2">{t('hero.note')}</span>
          </div>
          <TideLine animateIn />
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="text-heading">{t('morning.title')}</h2>
          <ol className="flex max-w-[65ch] list-decimal flex-col gap-3 pl-6 text-body text-ink-2">
            {MORNING_STEPS.map((step) => (
              <li key={step}>{t(`morning.steps.${step}`)}</li>
            ))}
          </ol>
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="text-heading">{t('low.title')}</h2>
          <p className="max-w-[65ch] text-body text-ink-2">{t('low.body')}</p>
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="text-heading">{t('notHere.title')}</h2>
          <p className="max-w-[65ch] text-body text-ink-2">{t('notHere.body')}</p>
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="text-heading">{t('together.title')}</h2>
          <p className="max-w-[65ch] text-body text-ink-2">{t('together.body')}</p>
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="text-heading">{t('price.title')}</h2>
          <p className="max-w-[65ch] text-body text-ink-2">{t('price.body')}</p>
          <p className="max-w-[65ch] text-small text-ink-2">{t('price.selfHost')}</p>
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="text-heading">{t('faq.title')}</h2>
          <div className="flex max-w-[65ch] flex-col divide-y divide-line">
            {FAQ.map((item) => (
              <details key={item} className="py-3">
                <summary className="min-h-11 cursor-pointer text-body font-medium">
                  {t(`faq.${item}.question`)}
                </summary>
                <p className="pt-2 text-body text-ink-2">{t(`faq.${item}.answer`)}</p>
              </details>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-line py-6">
        <nav aria-label={tLegal('links.label')} className="flex flex-wrap gap-4 text-small text-ink-2">
          {LEGAL_DOCS.map((doc) => (
            <Link key={doc} to="/legal/$doc" params={{ doc }} className="hover:text-ink">
              {tLegal(`links.${doc}`)}
            </Link>
          ))}
        </nav>
      </footer>
    </div>
  )
}
