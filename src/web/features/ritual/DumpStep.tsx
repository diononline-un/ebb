import { useTranslation } from 'react-i18next'
import { Button } from '../../ui/Button.tsx'
import { DumpComposer } from '../dump/DumpComposer.tsx'
import { DumpList } from '../dump/DumpList.tsx'
import { useDumpActions, useDumpLines, useDumpSubmit } from '../dump/api.ts'
import type { DumpEntry } from '../dump/types.ts'

export type DumpStepProps = {
  onNext: () => void
}

/** Step 3: get it out of the head first, in the same composer and list the dump screen uses. */
export function DumpStep({ onNext }: DumpStepProps) {
  const { t } = useTranslation('ritual')
  const dump = useDumpSubmit()
  const lines = useDumpLines()
  const actions = useDumpActions()
  // Only thoughts that are no task yet: one tap puts a thought into the inbox the next step sorts.
  const open: DumpEntry[] = (lines.data ?? [])
    .filter((line) => !line.taskId)
    .map((line) => ({ id: line.id, text: line.text, taskId: null, pending: false }))

  return (
    <div className="flex flex-1 flex-col gap-6">
      <p className="text-question">{t('dump.question')}</p>
      {open.length > 0 ? <DumpList entries={open} onToTask={actions.toTask} onArchive={actions.archive} /> : null}
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
