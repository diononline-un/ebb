import { useTranslation } from 'react-i18next'
import { Button } from '../../ui/Button.tsx'
import { DumpComposer } from '../dump/DumpComposer.tsx'
import { useDumpSubmit } from '../dump/api.ts'

export type DumpStepProps = {
  onNext: () => void
}

/** Step 3: get it out of the head first, in the same composer the dump screen uses. */
export function DumpStep({ onNext }: DumpStepProps) {
  const { t } = useTranslation('ritual')
  const dump = useDumpSubmit()

  return (
    <div className="flex flex-1 flex-col gap-6">
      <p className="text-question">{t('dump.question')}</p>
      <DumpComposer onSubmit={dump.submit} busy={dump.busy} error={dump.error} />
      <div className="mt-auto flex flex-wrap gap-2">
        <Button type="button" className="min-h-14" onClick={onNext}>
          {t('dump.done')}
        </Button>
        <Button type="button" variant="ghost" className="min-h-14" onClick={onNext}>
          {t('dump.skip')}
        </Button>
      </div>
    </div>
  )
}
