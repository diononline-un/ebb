import { useRouter } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Task, TaskPatch, TodayView } from '../../../shared/schemas/task.ts'
import { cn } from '../../lib/cn.ts'
import { Button } from '../../ui/Button.tsx'
import { Input } from '../../ui/Input.tsx'
import { Sheet } from '../../ui/Sheet.tsx'
import { Textarea } from '../../ui/Textarea.tsx'
import { TideLine } from '../../ui/TideLine.tsx'
import { useCurrentFocus, useStopFocus } from '../focus/api.ts'
import { CurrentFocusTimer } from '../focus/FocusTimer.tsx'
import { StartFocusButton } from '../focus/StartFocusButton.tsx'
import { usePatchTask, useToday } from '../tasks/api.ts'
import { lowCandidates, pickLowTask } from './pickLowTask.ts'

export type LowModeProps = {
  view: TodayView
  /** Patches one task and resolves when the server has taken it. */
  onPatch: (id: string, patch: TaskPatch) => Promise<unknown>
  onGoToToday: () => void
}

/**
 * The low-energy day (DESIGN §6): the day's title, one task, the tide line, and nothing below it
 * except the few actions. The task itself fades in with the sheet motion of §7.
 */
export function LowMode({ view, onPatch, onGoToToday }: LowModeProps) {
  const { t, i18n } = useTranslation('low')
  const [chosen, setChosen] = useState<string | null>(null)
  const [justDone, setJustDone] = useState(false)
  const [stopping, setStopping] = useState(false)
  const [choosing, setChoosing] = useState(false)
  const [note, setNote] = useState('')
  const current = useCurrentFocus()
  const stop = useStopFocus()

  const candidates = lowCandidates(view)
  const task = (chosen ? candidates.find((item) => item.id === chosen) : undefined) ?? pickLowTask(view)
  const dateLabel = new Intl.DateTimeFormat(i18n.language, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(new Date(`${view.date}T00:00:00Z`))

  const finish = async () => {
    if (!task) return
    await onPatch(task.id, { status: 'done' })
    setJustDone(true)
    setChosen(null)
    // Only the finished task's session ends; a timer for another task keeps running.
    const session = current.data
    if (session?.taskId === task.id) await stop.mutateAsync(session.id)
  }

  const stopForToday = async () => {
    if (!task) return
    const trimmed = note.trim()
    if (trimmed) await onPatch(task.id, { nextStep: trimmed })
    onGoToToday()
  }

  return (
    <section className="flex flex-col gap-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-title">{t('title')}</h1>
        <p className="text-meta text-ink-3">{dateLabel}</p>
      </header>

      {/* Above the one task, as Today shows it above the anchor; "Start 10 min" needs something to answer. */}
      <CurrentFocusTimer />

      {justDone ? (
        <div className="flex flex-col gap-3">
          <p className="text-body text-ink">{t('after.line')}</p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => setJustDone(false)}>
              {t('after.oneMore')}
            </Button>
            <Button type="button" variant="ghost" onClick={onGoToToday}>
              {t('after.callItADay')}
            </Button>
          </div>
        </div>
      ) : task ? (
        <LowTask key={task.id} task={task} />
      ) : (
        <div className="flex flex-col items-start gap-3">
          <p className="max-w-[65ch] text-body text-ink-2">{t('empty')}</p>
          <Button type="button" variant="secondary" onClick={onGoToToday}>
            {t('emptyAction')}
          </Button>
        </div>
      )}

      <TideLine />

      {task && !justDone ? (
        <div className="flex flex-col gap-3">
          <StepField key={task.id} task={task} onSave={(nextStep) => void onPatch(task.id, { nextStep })} />

          <div className="flex flex-wrap gap-2">
            <StartFocusButton taskId={task.id} minutes={10} />
            <Button type="button" variant="secondary" onClick={() => void finish()}>
              {t('actions.done')}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setChoosing(true)}>
              {t('actions.chooseAnother')}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setStopping(true)}>
              {t('actions.stop')}
            </Button>
          </div>

          {stopping ? (
            <form
              className="flex flex-col gap-2"
              onSubmit={(event) => {
                event.preventDefault()
                void stopForToday()
              }}
            >
              <label htmlFor="low-stop" className="text-small text-ink-2">
                {t('stop.question')}
              </label>
              <Textarea
                id="low-stop"
                value={note}
                maxLength={280}
                placeholder={t('stop.placeholder')}
                onChange={(event) => setNote(event.target.value)}
              />
              <div className="flex flex-wrap gap-2">
                <Button type="submit">{t('stop.save')}</Button>
                <Button type="button" variant="ghost" onClick={() => setStopping(false)}>
                  {t('stop.cancel')}
                </Button>
              </div>
            </form>
          ) : null}
        </div>
      ) : null}

      <Sheet open={choosing} onOpenChange={setChoosing} title={t('choose.title')}>
        <ul className="flex flex-col">
          {candidates.map((item) => (
            <li key={item.id} className="border-b border-line last:border-b-0">
              <button
                type="button"
                className="flex min-h-11 w-full items-center py-2 text-left text-body text-ink motion-quick hover:text-ink-2"
                onClick={() => {
                  setChosen(item.id)
                  setJustDone(false)
                  setChoosing(false)
                }}
              >
                {item.title}
              </button>
            </li>
          ))}
        </ul>
      </Sheet>
    </section>
  )
}

/** One task on --surface-2, radius 12; a new one fades in instead of appearing (DESIGN §7). */
function LowTask({ task }: { task: Task }) {
  const [shown, setShown] = useState(false)

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setShown(true)
    })
    return () => cancelAnimationFrame(frame)
  }, [])

  return (
    <article
      className={cn(
        'rounded-card bg-surface-2 p-4 motion-standard',
        shown ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0 motion-reduce:translate-y-0',
      )}
    >
      <p className="text-body text-ink">{task.title}</p>
    </article>
  )
}

/** "First 10-minute step": kept in nextStep, saved when the field loses focus. */
function StepField({ task, onSave }: { task: Task; onSave: (nextStep: string) => void }) {
  const { t } = useTranslation('low')
  const [value, setValue] = useState(task.nextStep)

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor="low-step" className="text-small text-ink-2">
        {t('step.label')}
      </label>
      <Input
        id="low-step"
        value={value}
        maxLength={280}
        placeholder={t('step.placeholder')}
        onChange={(event) => setValue(event.target.value)}
        onBlur={() => {
          const trimmed = value.trim()
          if (trimmed !== task.nextStep) onSave(trimmed)
        }}
      />
    </div>
  )
}

/** Route page: loads the day and hands the mode its callbacks. */
export function LowPage() {
  const { t } = useTranslation('low')
  const query = useToday()
  const patchTask = usePatchTask()
  const router = useRouter()

  if (query.isPending) {
    return <p className="text-body text-ink-2">{t('loading')}</p>
  }

  if (!query.data) {
    return <p className="text-body text-ink-2">{t('loadError')}</p>
  }

  return (
    <LowMode
      view={query.data}
      onPatch={(id, patch) => patchTask.mutateAsync({ id, patch })}
      onGoToToday={() => void router.navigate({ to: '/today' })}
    />
  )
}
