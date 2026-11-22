import { useQueryClient } from '@tanstack/react-query'
import { useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ResetCurrent, ResetOutlookDay, ResetPatch, StuckDecision } from '../../../shared/schemas/reset.ts'
import type { Task } from '../../../shared/schemas/task.ts'
import { ApiError } from '../../lib/api.ts'
import { Button } from '../../ui/Button.tsx'
import { deleteTask, usePatchTask } from '../tasks/api.ts'
import { TaskSheet } from '../tasks/TaskSheet.tsx'
import { formatDay, useCompleteReset, useDecideStuck, useReset, useSaveReset } from './api.ts'
import { NumbersStep } from './NumbersStep.tsx'
import { ReviewStep } from './ReviewStep.tsx'
import { StuckStep } from './StuckStep.tsx'

/** Four steps, then the week is closed: the numbers map a step to its screen (PRD F12). */
const STEPS = 4
/** The stuck tasks are step 3, so a refused finish sends the flow back there. */
const STUCK_STEP = 2

export type ResetFlowProps = {
  view: ResetCurrent
  onSave: (patch: ResetPatch) => Promise<unknown>
  onDecide: (taskId: string, decision: StuckDecision) => Promise<unknown>
  onFinish: () => Promise<unknown>
  onOpenTask: (task: Task) => void
  onGoHistory: () => void
}

/**
 * The weekly reset (PRD F12, docs/specs/E06-weekly-reset.md): review, numbers, the stuck tasks, the
 * week ahead. The server keeps the step and the answers, so an interruption continues where it stopped.
 */
export function ResetFlow({ view, onSave, onDecide, onFinish, onOpenTask, onGoHistory }: ResetFlowProps) {
  const { t, i18n } = useTranslation('reset')
  const [step, setStep] = useState(view.step)
  const [waiting, setWaiting] = useState(false)
  const [failed, setFailed] = useState(false)

  const done = view.completedAt !== null || step >= STEPS
  const range = `${formatDay(view.weekStart, i18n.language)} – ${formatDay(view.weekEnd, i18n.language)}`

  // The step moves right away and travels behind: the flow stays usable while the answer is on its way.
  const goTo = (next: number) => {
    setStep(next)
    setFailed(false)
    void onSave({ step: next }).catch(() => setFailed(true))
  }

  const decide = async (taskId: string, decision: StuckDecision) => {
    await onDecide(taskId, decision)
    setWaiting(false)
  }

  const finish = async () => {
    setFailed(false)
    try {
      await onFinish()
      setStep(STEPS)
    } catch (error) {
      // A stuck task is the one reason the server refuses; it is a step back, not an error (PRD F12).
      if (error instanceof ApiError && error.code === 'stuck_open') {
        setWaiting(true)
        setStep(STUCK_STEP)
        return
      }
      setFailed(true)
    }
  }

  return (
    <section className="flex flex-col gap-8 lg:gap-12">
      <header className="flex flex-col gap-2">
        <h1 className="text-title">{t('title')}</h1>
        <p className="text-meta text-ink-3">{range}</p>
      </header>

      {done ? (
        <DoneView view={view} onGoHistory={onGoHistory} />
      ) : (
        <>
          <ResetProgress done={step} total={STEPS} />

          {failed ? (
            <p role="alert" className="text-small text-danger">
              {t('saveError')}
            </p>
          ) : null}

          {step === 0 ? <ReviewStep answers={view} onSave={onSave} onNext={() => goTo(1)} /> : null}

          {step === 1 ? <NumbersStep stats={view.stats} onNext={() => goTo(2)} /> : null}

          {step === STUCK_STEP ? (
            <StuckStep
              stuck={view.stuck}
              waiting={waiting}
              onDecide={decide}
              onOpenTask={onOpenTask}
              onNext={() => goTo(3)}
            />
          ) : null}

          {step === 3 ? <OutlookStep outlook={view.outlook} onFinish={finish} /> : null}
        </>
      )}
    </section>
  )
}

/** The tide line as the reset's progress, the same fine line the ritual uses (DESIGN §5, no numbers). */
function ResetProgress({ done, total }: { done: number; total: number }) {
  const { t } = useTranslation('reset')
  const fraction = total === 0 ? 1 : Math.min(1, done / total)

  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={done}
      aria-label={t('progressLabel')}
      className="h-px w-full origin-left bg-line"
    >
      <div className="h-px w-full origin-left bg-signal motion-standard" style={{ transform: `scaleX(${fraction})` }} />
    </div>
  )
}

/** Step 4: the next seven days as plain text, then the end of the week. */
function OutlookStep({ outlook, onFinish }: { outlook: ResetOutlookDay[]; onFinish: () => Promise<unknown> }) {
  const { t, i18n } = useTranslation('reset')
  const days = outlook.filter((day) => day.deadline.length > 0 || day.planned.length > 0)

  return (
    <div className="flex flex-col gap-8">
      <h2 className="text-heading">{t('outlook.question')}</h2>

      {days.length === 0 ? (
        <p className="max-w-[65ch] text-body text-ink-2">{t('outlook.empty')}</p>
      ) : (
        <div className="flex flex-col gap-6">
          {days.map((day) => (
            <div key={day.date} className="flex flex-col gap-2">
              <h3 className="text-meta text-ink-3">{formatDay(day.date, i18n.language)}</h3>
              <ul className="flex flex-col">
                {day.deadline.map((task) => (
                  <li
                    key={task.id}
                    className="flex items-baseline justify-between gap-3 border-b border-line py-2 last:border-b-0"
                  >
                    <span className="min-w-0 text-body break-words text-ink">{task.title}</span>
                    <span className="shrink-0 text-meta text-ink-3">{t('outlook.deadline')}</span>
                  </li>
                ))}
                {day.planned.map((task) => (
                  <li key={task.id} className="border-b border-line py-2 last:border-b-0">
                    <span className="text-body break-words text-ink">{task.title}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      <div>
        <Button type="button" onClick={() => void onFinish()}>
          {t('outlook.finish')}
        </Button>
      </div>
    </div>
  )
}

/** A closed week shows what was written, plus the way to the weeks before it. */
function DoneView({ view, onGoHistory }: { view: ResetCurrent; onGoHistory: () => void }) {
  const { t } = useTranslation('reset')
  const written = [
    { question: t('review.wentWell'), text: view.wentWell },
    { question: t('review.wentBadly'), text: view.wentBadly },
    { question: t('review.change'), text: view.change },
  ].filter((answer) => answer.text.trim() !== '')

  return (
    <div className="flex flex-col gap-8">
      <h2 className="text-heading">{t('done.title')}</h2>

      {written.length === 0 ? <p className="max-w-[65ch] text-body text-ink-2">{t('done.empty')}</p> : null}

      {written.map((answer) => (
        <div key={answer.question} className="flex flex-col gap-1">
          <h3 className="text-small text-ink-2">{answer.question}</h3>
          <p className="max-w-[65ch] text-body whitespace-pre-wrap text-ink">{answer.text}</p>
        </div>
      ))}

      <div>
        <Button type="button" variant="secondary" onClick={onGoHistory}>
          {t('done.history')}
        </Button>
      </div>
    </div>
  )
}

/** Route page: loads the week and wires the flow to the reset endpoints and the task sheet. */
export function ResetPage() {
  const { t } = useTranslation('reset')
  const query = useReset()
  const save = useSaveReset()
  const decide = useDecideStuck()
  const finish = useCompleteReset()
  const patch = usePatchTask()
  const queryClient = useQueryClient()
  const router = useRouter()
  // The task stays in hand: a split decision takes it out of the stuck list while its sheet is open.
  const [opened, setOpened] = useState<Task | null>(null)

  if (query.isPending) {
    return <p className="text-body text-ink-2">{t('loading')}</p>
  }

  if (!query.data) {
    return <p className="text-body text-ink-2">{t('loadError')}</p>
  }

  const view = query.data
  const sheetTask = opened === null ? null : (view.stuck.find((task) => task.id === opened.id) ?? opened)

  return (
    <>
      <ResetFlow
        view={view}
        onSave={(patchBody) => save.mutateAsync(patchBody)}
        onDecide={(taskId, decision) => decide.mutateAsync({ taskId, decision })}
        onFinish={() => finish.mutateAsync()}
        onOpenTask={setOpened}
        onGoHistory={() => void router.navigate({ to: '/reset/history' })}
      />

      <TaskSheet
        task={sheetTask}
        onOpenChange={(open) => {
          if (open) return
          setOpened(null)
          void queryClient.invalidateQueries({ queryKey: ['reset'] })
        }}
        onPatch={(id, patchBody) => patch.mutateAsync({ id, patch: patchBody })}
        onDelete={async (id) => {
          await deleteTask(id)
          await queryClient.invalidateQueries({ queryKey: ['reset'] })
        }}
      />
    </>
  )
}
