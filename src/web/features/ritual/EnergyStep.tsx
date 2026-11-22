import { useTranslation } from 'react-i18next'
import type { Energy } from '../../../shared/schemas/day.ts'
import { Button } from '../../ui/Button.tsx'

export type EnergyStepProps = {
  onAnswer: (energy: Energy) => void
}

/** Step 1: the question the day starts with, with both answers in thumb reach (DESIGN §5). */
export function EnergyStep({ onAnswer }: EnergyStepProps) {
  const { t } = useTranslation('ritual')

  return (
    <div className="flex flex-1 flex-col gap-8">
      <p className="text-question">{t('energy.question')}</p>
      <div className="mt-auto flex flex-col gap-3">
        <Button type="button" variant="secondary" className="min-h-14 justify-start" onClick={() => onAnswer('low')}>
          {t('energy.low')}
        </Button>
        <Button type="button" variant="secondary" className="min-h-14 justify-start" onClick={() => onAnswer('good')}>
          {t('energy.good')}
        </Button>
      </div>
    </div>
  )
}
