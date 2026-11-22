import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { addDays, weekStart } from '../../../shared/day.ts'
import type { BlockSlot, TriageAnswer } from '../../../shared/triage.ts'
import type { Task, TodayView } from '../../../shared/schemas/task.ts'
import { cn } from '../../lib/cn.ts'
import { Button } from '../../ui/Button.tsx'
import { Input } from '../../ui/Input.tsx'
import { AnchorBlock } from '../today/AnchorBlock.tsx'
import { ProgressLine } from './ProgressLine.tsx'
import type { AnchorHandler, TriageHandler } from './types.ts'

const BLOCKS: BlockSlot[] = ['block1', 'block2', 'block3', 'block4']

type Step =
  | { kind: 'answer' }
  | { kind: 'block'; answer: 'must_today' | 'today' }
  | { kind: 'later' }

export type TriageFlowProps = {
  view: TodayView
  onTriage: TriageHandler
  onChooseAnchor: AnchorHandler
  onDone: () => void
}

/**
 * One question per screen over today's inbox (DESIGN §5, "Ritual"): four answers in thumb reach,
 * a second step for the block or the day, then the anchor. Esc leaves at any point.
 */
export function TriageFlow({ view, onTriage, onChooseAnchor, onDone }: TriageFlowProps) {
  const { t, i18n } = useTranslation('triage')
  const [index, setIndex] = useState(0)
  const [step, setStep] = useState<Step>({ kind: 'answer' })
  const [leaving, setLeaving] = useState(false)
  const [visible, setVisible] = useState(false)
  const [busy, setBusy] = useState(false)
  const [pickedDate, setPickedDate] = useState('')
  const [sortedAway, setSortedAway] = useState<string[]>([])
  // Snapshot: every answer moves the task out of the inbox, and the live list would shift under
  // the index. The flow asks each task exactly once, in the order it found them.
  const [queue] = useState<Task[]>(() => view.slots.inbox)

  const total = queue.length + 1
  const current = queue[index] ?? null
  const finished = index >= queue.length

  // A new card fades in; the old one slides out to the left (§7, pattern 2).
  useEffect(() => {
    setVisible(false)
    const frame = requestAnimationFrame(() => {
      setVisible(true)
    })
    return () => cancelAnimationFrame(frame)
  }, [index, step.kind, finished])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onDone()
        return
      }
      const position = Number(event.key)
      if (!Number.isInteger(position) || position < 1 || position > 4 || busy) return

      if (finished) return
      if (step.kind === 'answer') {
        const kinds = ['must_today', 'later', 'errand', 'today'] as const
        void answer(kinds[position - 1] ?? 'errand')
      } else if (step.kind === 'block') {
        const slot = BLOCKS[position - 1]
        if (slot) void send({ kind: step.answer, slot })
      } else {
        const days = laterDays(view.date)
        const day = days[position - 1]
        if (day) void send({ kind: 'later', date: day })
      }
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const advance = () => {
    setLeaving(true)
    // 240 ms, the standard duration (§7). Reduced motion is handled in CSS: the transform is gone,
    // the fade stays (motion-reduce:translate-x-0).
    window.setTimeout(() => {
      setLeaving(false)
      setStep({ kind: 'answer' })
      setPickedDate('')
      setIndex((currentIndex) => currentIndex + 1)
    }, 240)
  }

  const send = async (answer: TriageAnswer) => {
    if (!current) return
    setBusy(true)
    try {
      await onTriage(current.id, answer)
      if (answer.kind === 'later' || answer.kind === 'errand') {
        setSortedAway((before) => [...before, current.id])
      }
      advance()
    } finally {
      setBusy(false)
    }
  }

  const answer = async (kind: 'must_today' | 'later' | 'errand' | 'today') => {
    if (kind === 'must_today' || kind === 'today') {
      setStep({ kind: 'block', answer: kind })
      return
    }
    if (kind === 'later') {
      setStep({ kind: 'later' })
      return
    }
    await send({ kind: 'errand' })
  }

  const candidates = [
    ...view.must,
    ...queue,
    ...view.slots.block1,
    ...view.slots.block2,
    ...view.slots.block3,
    ...view.slots.block4,
  ].filter((task) => !sortedAway.includes(task.id))

  const chooseAnchor = async (task: Task, replace: boolean): Promise<'ok' | 'conflict'> => {
    const result = await onChooseAnchor(task.id, replace)
    if (result === 'ok') onDone()
    return result
  }

  return (
    <div className="fixed inset-0 z-40 flex flex-col overflow-y-auto bg-ground px-4 py-6">
      <div className="mx-auto flex w-full max-w-content flex-1 flex-col gap-8">
        <div className="flex items-start justify-between gap-3">
          <ProgressLine done={finished ? total : index} total={total} />
          <Button type="button" variant="ghost" onClick={onDone}>
            {t('close')}
          </Button>
        </div>

        <div
          className={cn(
            'motion-standard flex flex-1 flex-col gap-8',
            visible && !leaving ? 'opacity-100' : 'opacity-0',
            leaving && '-translate-x-6 motion-reduce:translate-x-0',
          )}
        >
          {finished ? (
            <div className="flex flex-col gap-6">
              <h1 className="text-question">{t('anchorTitle')}</h1>
              <AnchorBlock
                anchor={null}
                candidates={candidates}
                today={view.date}
                onToggle={() => {}}
                onOpen={() => {}}
                onChoose={chooseAnchor}
              />
              <Button type="button" variant="ghost" onClick={onDone}>
                {t('anchorSkip')}
              </Button>
            </div>
          ) : step.kind === 'answer' ? (
            <div className="flex flex-1 flex-col gap-8">
              <div className="flex flex-col gap-3">
                <p className="text-question">{t('question')}</p>
                <p className="text-body text-ink-2">{current?.title}</p>
              </div>
              <div className="mt-auto flex flex-col gap-3">
                <Button type="button" variant="secondary" className="min-h-14 justify-start" onClick={() => void answer('must_today')}>
                  <Marker position={1} />
                  <span>{t('answers.must')}</span>
                </Button>
                <Button type="button" variant="secondary" className="min-h-14 justify-start" onClick={() => void answer('later')}>
                  <Marker position={2} />
                  <span>{t('answers.later')}</span>
                </Button>
                <Button type="button" variant="secondary" className="min-h-14 justify-start" onClick={() => void answer('errand')}>
                  <Marker position={3} />
                  <span>{t('answers.errand')}</span>
                </Button>
                <Button type="button" variant="secondary" className="min-h-14 justify-start" onClick={() => void answer('today')}>
                  <Marker position={4} />
                  <span>{t('answers.today')}</span>
                </Button>
              </div>
            </div>
          ) : step.kind === 'block' ? (
            <div className="flex flex-1 flex-col gap-8">
              <p className="text-question">{t('blockQuestion')}</p>
              <div className="mt-auto flex flex-col gap-3">
                {BLOCKS.map((slot, position) => (
                  <Button
                    key={slot}
                    type="button"
                    variant="secondary"
                    className="min-h-14 justify-start"
                    onClick={() => void send({ kind: step.answer, slot })}
                  >
                    <Marker position={position + 1} />
                    <span>{t(slot)}</span>
                  </Button>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-1 flex-col gap-8">
              <p className="text-question">{t('laterQuestion')}</p>
              <div className="mt-auto flex flex-col gap-3">
                {laterDays(view.date).map((day, position) => (
                  <Button
                    key={day}
                    type="button"
                    variant="secondary"
                    className="min-h-14 justify-start"
                    onClick={() => void send({ kind: 'later', date: day })}
                  >
                    <Marker position={position + 1} />
                    <span>{laterLabel(day, view.date, t, i18n.language)}</span>
                  </Button>
                ))}
                <div className="flex flex-col gap-2">
                  <label htmlFor="triage-date" className="text-small text-ink-2">
                    {t('pickDate')}
                  </label>
                  <Input
                    id="triage-date"
                    type="date"
                    value={pickedDate}
                    min={addDays(view.date, 1)}
                    onChange={(event) => setPickedDate(event.target.value)}
                  />
                  <Button
                    type="button"
                    disabled={!pickedDate || pickedDate <= view.date}
                    onClick={() => void send({ kind: 'later', date: pickedDate })}
                  >
                    {t('laterConfirm')}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/** The keyboard digit shown next to an answer; screen readers get the label alone. */
function Marker({ position }: { position: number }) {
  return (
    <span aria-hidden="true" className="text-ink-3">
      {position}
    </span>
  )
}

function laterDays(today: string): string[] {
  // On a Sunday "tomorrow" and "next Monday" are the same day, so the list has no duplicate keys.
  return [...new Set([addDays(today, 1), addDays(today, 2), addDays(weekStart(today, 1), 7)])]
}

type Translate = (key: string) => string

function laterLabel(day: string, today: string, t: Translate, locale: string): string {
  if (day === addDays(today, 1)) return t('tomorrow')
  if (day === addDays(today, 2)) return t('dayAfter')
  if (day === addDays(weekStart(today, 1), 7)) return t('nextMonday')
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(
    new Date(`${day}T00:00:00Z`),
  )
}
