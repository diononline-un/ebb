import { useTranslation } from 'react-i18next'

export type ProgressLineProps = {
  done: number
  total: number
}

/**
 * The tide line as a progress bar (DESIGN §6): one 1 px line in --signal that fills from the left.
 * It scales instead of growing a width, so the browser only animates a transform.
 */
export function ProgressLine({ done, total }: ProgressLineProps) {
  const { t } = useTranslation('triage')
  const fraction = total === 0 ? 1 : Math.min(1, done / total)

  return (
    <div className="flex flex-col gap-2">
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={done}
        aria-label={t('progressLabel')}
        className="h-px w-full origin-left bg-signal motion-standard"
        style={{ transform: `scaleX(${fraction})` }}
      />
      <p className="text-meta text-ink-3">{t('progress', { done, total })}</p>
    </div>
  )
}
