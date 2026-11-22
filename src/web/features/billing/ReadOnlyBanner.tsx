import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { useMe } from '../onboarding/api.ts'

/**
 * One quiet line while writing is closed (DESIGN §9): no countdown, no dialog, just the way back to
 * a subscription. The API gate is the authority; this only says what is going on.
 */
export function ReadOnlyBanner() {
  const { t } = useTranslation('billing')
  const me = useMe()

  if (me.data?.access.access !== false) return null

  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-control border border-line px-4 py-3">
      <p className="max-w-[65ch] text-small text-ink-2">{t('readOnly.line')}</p>
      <Link to="/more" className="text-small text-ink-2 underline hover:text-ink">
        {t('readOnly.action')}
      </Link>
    </div>
  )
}
