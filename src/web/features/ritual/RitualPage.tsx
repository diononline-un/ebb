import { useQueryClient } from '@tanstack/react-query'
import { useRouter } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Energy } from '../../../shared/schemas/day.ts'
import type { TodayView } from '../../../shared/schemas/task.ts'
import { ApiError } from '../../lib/api.ts'
import { trackEvent } from '../../lib/events.ts'
import { Button } from '../../ui/Button.tsx'
import { useTimerDefault } from '../focus/api.ts'
import { triageTask, usePatchTask, useToday } from '../tasks/api.ts'
import { RolloverNote } from '../today/RolloverNote.tsx'
import { TriageFlow } from '../triage/TriageFlow.tsx'
import type { AnchorHandler, TriageHandler } from '../triage/types.ts'
import { ritualSkipped, skipRitual, useFinishRitual, useSetEnergy } from './api.ts'
import { DumpStep } from './DumpStep.tsx'
import { EnergyStep } from './EnergyStep.tsx'
import { StartStep } from './StartStep.tsx'

type Step = 'energy' | 'rollover' | 'dump' | 'triage' | 'start'

export type RitualProps = {
  view: TodayView
  /** The usual session length; one tap starts Block 1 with it. */
  usualMinutes: number
  onEnergy: (energy: Energy) => Promise<unknown>
  onFinish: () => Promise<unknown>
  onTriage: TriageHandler
  onChooseAnchor: AnchorHandler
  onGoToday: () => void
  onGoLow: () => void
}

/**
 * The morning ritual (docs/specs/E03-energie.md): energy, the rollover note when there is one, the
 * dump, the sorting with its anchor, then the first block. One question per screen (DESIGN §5).
 */
export function Ritual({ view, usualMinutes, onEnergy, onFinish, onTriage, onChooseAnchor, onGoToday, onGoLow }: RitualProps) {
  const { t } = useTranslation('ritual')
  const [step, setStep] = useState<Step>('energy')
  const [energy, setEnergy] = useState<Energy | null>(view.energy)
  const [failed, setFailed] = useState(false)

  const steps: Step[] = view.rolledCount > 0
    ? ['energy', 'rollover', 'dump', 'triage', 'start']
    : ['energy', 'dump', 'triage', 'start']
  const position = Math.max(0, steps.indexOf(step))

  const leave = () => {
    skipRitual(view.date)
    onGoToday()
  }

  useEffect(() => {
    // The sorting screen owns Escape while it is open; its own leave answers with onDone.
    if (step === 'triage') return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') leave()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [step])

  const answerEnergy = async (answer: Energy) => {
    await onEnergy(answer)
    setEnergy(answer)
    setStep(view.rolledCount > 0 ? 'rollover' : 'dump')
  }

  const finish = async () => {
    await onFinish()
    if (energy === 'low') onGoLow()
    else onGoToday()
  }

  // A low day goes straight into the low-energy mode; a good one offers the first block.
  const afterTriage = async () => {
    if (energy === 'low') return finish()
    setStep('start')
  }

  // Offline or a server hiccup: say so on the ritual's own screen instead of hanging without a word.
  // The sorting screen covers that screen, so a failure there lands on the start step to retry.
  const run = (action: () => Promise<void>) => {
    setFailed(false)
    action().catch(() => {
      setFailed(true)
      if (step === 'triage') setStep('start')
    })
  }

  if (step === 'triage') {
    return (
      <TriageFlow
        view={view}
        onTriage={onTriage}
        onChooseAnchor={onChooseAnchor}
        onDone={() => run(afterTriage)}
      />
    )
  }

  return (
    <div className="fixed inset-0 z-40 flex flex-col overflow-y-auto bg-ground px-4 py-6">
      <div className="mx-auto flex w-full max-w-content flex-1 flex-col gap-8">
        <div className="flex items-center gap-3">
          <RitualProgress done={position} total={steps.length} />
          <Button type="button" variant="ghost" onClick={leave}>
            {t('leave')}
          </Button>
        </div>

        {failed ? (
          <p role="alert" className="text-small text-danger">
            {t('saveError')}
          </p>
        ) : null}

        {step === 'energy' ? <EnergyStep onAnswer={(answer) => run(() => answerEnergy(answer))} /> : null}

        {step === 'rollover' ? (
          <div className="flex flex-1 flex-col gap-8">
            <RolloverNote count={view.rolledCount} date={view.date} />
            <Button type="button" variant="secondary" className="mt-auto min-h-14" onClick={() => setStep('dump')}>
              {t('rollover.continue')}
            </Button>
          </div>
        ) : null}

        {step === 'dump' ? <DumpStep onNext={() => setStep('triage')} /> : null}

        {step === 'start' ? (
          <StartStep minutes={usualMinutes} onStart={() => run(finish)} onNotNow={() => run(finish)} />
        ) : null}
      </div>
    </div>
  )
}

/** The tide line as the ritual's progress (DESIGN §5: a fine line, no step numbers). */
function RitualProgress({ done, total }: { done: number; total: number }) {
  const { t } = useTranslation('ritual')
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

/** Route page: loads the day, writes energy and the finish, and hands the flow its callbacks. */
export function RitualPage() {
  const { t } = useTranslation('ritual')
  const query = useToday()
  const patchTask = usePatchTask()
  const queryClient = useQueryClient()
  const router = useRouter()
  const setEnergy = useSetEnergy()
  const finishRitual = useFinishRitual()
  const usualMinutes = useTimerDefault()

  // E10-P6: D7 retention counts the days the morning ritual was opened (PRD §10).
  useEffect(() => {
    trackEvent('ritual.opened')
  }, [])

  if (query.isPending) {
    return <p className="text-body text-ink-2">{t('loading')}</p>
  }

  if (!query.data) {
    return <p className="text-body text-ink-2">{t('loadError')}</p>
  }

  const onTriage: TriageHandler = async (id, answer) => {
    await triageTask(id, answer)
    await queryClient.invalidateQueries({ queryKey: ['today'] })
  }

  const onChooseAnchor: AnchorHandler = async (id, replace) => {
    try {
      await patchTask.mutateAsync({ id, patch: replace ? { anchor: true, replaceAnchor: true } : { anchor: true } })
      return 'ok'
    } catch (error) {
      if (error instanceof ApiError && error.code === 'anchor_exists') return 'conflict'
      throw error
    }
  }

  return (
    <Ritual
      view={query.data}
      usualMinutes={usualMinutes}
      onEnergy={(energy) => setEnergy.mutateAsync(energy)}
      onFinish={() => finishRitual.mutateAsync()}
      onTriage={onTriage}
      onChooseAnchor={onChooseAnchor}
      onGoToday={() => void router.navigate({ to: '/today' })}
      onGoLow={() => void router.navigate({ to: '/low' })}
    />
  )
}
