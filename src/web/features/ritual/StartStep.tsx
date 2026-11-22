import { useTranslation } from 'react-i18next'
import { Button } from '../../ui/Button.tsx'
import { StartFocusButton } from '../focus/StartFocusButton.tsx'

export type StartStepProps = {
  /** The usual length from the settings; one tap starts the first block with it. */
  minutes: number
  onStart: () => void
  onNotNow: () => void
}

/** Step 6: into the first block with the timer, or into the day without it. */
export function StartStep({ minutes, onStart, onNotNow }: StartStepProps) {
  const { t } = useTranslation('ritual')

  return (
    <div className="flex flex-1 flex-col gap-8">
      <p className="text-question">{t('start.question')}</p>
      <div className="mt-auto flex flex-col gap-3">
        <StartFocusButton slot="block1" minutes={minutes} className="min-h-14" onStart={onStart} />
        <Button type="button" variant="ghost" className="min-h-14" onClick={onNotNow}>
          {t('start.notNow')}
        </Button>
      </div>
    </div>
  )
}
