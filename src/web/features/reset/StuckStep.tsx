import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { StuckDecision } from '../../../shared/schemas/reset.ts'
import type { Task } from '../../../shared/schemas/task.ts'
import { Button } from '../../ui/Button.tsx'
import { Dialog } from '../../ui/Dialog.tsx'
import { Input } from '../../ui/Input.tsx'

const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000

export type StuckStepProps = {
  stuck: Task[]
  /** True after "Finish the week" was refused: a task is still waiting for its decision. */
  waiting: boolean
  onDecide: (taskId: string, decision: StuckDecision) => Promise<unknown>
  onOpenTask: (task: Task) => void
  onNext: () => void
}

/**
 * Step 3: the tasks that keep coming along. Each one gets one of four decisions (PRD F12): a new
 * day, a split into steps, not today, or gone. "Later" is missing on purpose.
 */
export function StuckStep({ stuck, waiting, onDecide, onOpenTask, onNext }: StuckStepProps) {
  const { t } = useTranslation('reset')

  return (
    <div className="flex flex-col gap-8">
      <h2 className="text-heading">{t('stuck.question')}</h2>

      {waiting ? <p className="text-body text-ink-2">{t('stuck.waiting')}</p> : null}

      {stuck.length === 0 ? (
        <p className="max-w-[65ch] text-body text-ink-2">{t('stuck.empty')}</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {stuck.map((task) => (
            <li key={task.id}>
              <StuckCard task={task} onDecide={onDecide} onOpenTask={onOpenTask} />
            </li>
          ))}
        </ul>
      )}

      <div>
        <Button type="button" variant="secondary" onClick={onNext}>
          {t('stuck.continue')}
        </Button>
      </div>
    </div>
  )
}

type StuckCardProps = {
  task: Task
  onDecide: (taskId: string, decision: StuckDecision) => Promise<unknown>
  onOpenTask: (task: Task) => void
}

/** One stuck task on --surface-2, the same surface the ritual's questions use (DESIGN §6). */
function StuckCard({ task, onDecide, onOpenTask }: StuckCardProps) {
  const { t } = useTranslation('reset')
  const [dating, setDating] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  const older = Date.now() - new Date(task.createdAt).getTime() > FOURTEEN_DAYS_MS
  const meta = [task.pushCount >= 3 ? t('stuck.pushed', { count: task.pushCount }) : '', older ? t('stuck.older') : '']
    .filter((part) => part !== '')
    .join(' · ')

  const decide = async (decision: StuckDecision) => {
    setFailed(false)
    setBusy(true)
    try {
      await onDecide(task.id, decision)
      // Splitting is only half done by the server: the steps are written in the task's own sheet.
      if (decision.decision === 'split') onOpenTask(task)
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <article className="flex flex-col gap-3 rounded-card bg-surface-2 p-4">
      <div className="flex flex-col gap-1">
        <p className="text-body break-words text-ink">{task.title}</p>
        {meta === '' ? null : <p className="text-meta text-ink-3">{meta}</p>}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" disabled={busy} onClick={() => setDating((open) => !open)}>
          {t('stuck.date')}
        </Button>
        <Button type="button" variant="secondary" disabled={busy} onClick={() => void decide({ decision: 'split' })}>
          {t('stuck.split')}
        </Button>
        <Button type="button" variant="ghost" disabled={busy} onClick={() => void decide({ decision: 'skip' })}>
          {t('stuck.skip')}
        </Button>
        <Button type="button" variant="danger" disabled={busy} onClick={() => setDeleting(true)}>
          {t('stuck.delete')}
        </Button>
      </div>

      {dating ? (
        <div className="flex flex-col gap-1">
          <label htmlFor={`reset-stuck-${task.id}`} className="text-small text-ink-2">
            {t('stuck.dateLabel')}
          </label>
          <Input
            id={`reset-stuck-${task.id}`}
            type="date"
            onChange={(event) => {
              const date = event.target.value
              if (date !== '') void decide({ decision: 'date', date })
            }}
          />
        </div>
      ) : null}

      {failed ? (
        <p role="alert" className="text-small text-danger">
          {t('saveError')}
        </p>
      ) : null}

      <Dialog
        open={deleting}
        onOpenChange={setDeleting}
        title={t('stuck.deleteQuestion')}
        description={t('stuck.deleteText')}
        footer={
          <>
            <Button type="button" variant="ghost" onClick={() => setDeleting(false)}>
              {t('common:actions.cancel')}
            </Button>
            <Button
              type="button"
              variant="danger"
              onClick={() => {
                setDeleting(false)
                void decide({ decision: 'delete' })
              }}
            >
              {t('stuck.deleteConfirm')}
            </Button>
          </>
        }
      />
    </article>
  )
}
