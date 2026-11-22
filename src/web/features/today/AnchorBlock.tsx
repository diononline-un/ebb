import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Task } from '../../../shared/schemas/task.ts'
import { Button } from '../../ui/Button.tsx'
import { Sheet } from '../../ui/Sheet.tsx'
import { TaskRow } from '../tasks/TaskRow.tsx'

export type AnchorBlockProps = {
  /** The one thing of the day, or a finished one that already moved to "done today". */
  anchor: Task | null
  /** Open tasks of today that could become the anchor. */
  candidates: Task[]
  today: string
  onToggle: (task: Task) => void
  onOpen: (task: Task) => void
  /** Answers 'conflict' when another task already holds today's anchor. */
  onChoose: (task: Task, replace: boolean) => Promise<'ok' | 'conflict'>
}

export function AnchorBlock({ anchor, candidates, today, onToggle, onOpen, onChoose }: AnchorBlockProps) {
  const { t } = useTranslation('today')
  const [picking, setPicking] = useState(false)
  const [pending, setPending] = useState<Task | null>(null)

  const choose = async (task: Task, replace: boolean) => {
    const result = await onChoose(task, replace)
    if (result === 'conflict') {
      setPending(task)
      return
    }
    setPending(null)
    setPicking(false)
  }

  return (
    <section className="flex flex-col gap-3">
      {anchor ? (
        <ul className="flex flex-col">
          <TaskRow task={anchor} today={today} onToggle={onToggle} onOpen={onOpen} />
        </ul>
      ) : (
        <div className="flex flex-col items-start gap-3">
          <p className="max-w-[65ch] text-body text-ink-2">{t('anchorEmpty')}</p>
          <Button type="button" variant="secondary" onClick={() => setPicking(true)}>
            {t('anchorAction')}
          </Button>
        </div>
      )}

      <Sheet open={picking} onOpenChange={setPicking} title={t('anchorPickTitle')}>
        {candidates.length === 0 ? (
          <p className="text-small text-ink-2">{t('anchorPickEmpty')}</p>
        ) : (
          <ul className="flex flex-col">
            {candidates.map((task) => (
              <li key={task.id} className="border-b border-line last:border-b-0">
                <button
                  type="button"
                  className="flex min-h-11 w-full items-center py-2 text-left text-body text-ink motion-quick hover:text-ink-2"
                  onClick={() => void choose(task, false)}
                >
                  {task.title}
                </button>
              </li>
            ))}
          </ul>
        )}

        {pending ? (
          <div className="mt-4 flex flex-col gap-2 rounded-control border border-line p-3">
            <p className="text-body text-ink">{t('anchorReplaceQuestion')}</p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={() => void choose(pending, true)}>
                {t('anchorReplaceAction')}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setPending(null)}>
                {t('anchorKeep')}
              </Button>
            </div>
          </div>
        ) : null}
      </Sheet>
    </section>
  )
}
