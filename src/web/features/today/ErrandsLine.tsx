import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

/** Errands are batched, not planned: one line with the number, the list lives in Plan (D1). */
export function ErrandsLine({ count }: { count: number }) {
  const { t } = useTranslation('today')
  if (count === 0) return null

  return (
    <p className="flex flex-wrap items-center gap-2 text-body text-ink-2">
      <span>{t('errands', { count })}</span>
      <Link to="/plan" className="text-small underline hover:text-ink">
        {t('errandsLink')}
      </Link>
    </p>
  )
}
