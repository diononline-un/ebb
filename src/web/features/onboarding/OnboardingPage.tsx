import { useQueryClient } from '@tanstack/react-query'
import { useRouter } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TodayView } from '../../../shared/schemas/task.ts'
import type { TriageAnswer } from '../../../shared/triage.ts'
import { ApiError } from '../../lib/api.ts'
import { Button } from '../../ui/Button.tsx'
import { DumpComposer } from '../dump/DumpComposer.tsx'
import { DumpList } from '../dump/DumpList.tsx'
import { DumpPrompts } from '../dump/DumpPrompts.tsx'
import { useDumpActions, useDumpLines, useDumpSubmit } from '../dump/api.ts'
import type { DumpEntry } from '../dump/types.ts'
import { triageTask, usePatchTask, useToday } from '../tasks/api.ts'
import { TriageFlow } from '../triage/TriageFlow.tsx'
import { patchSettings, useFinishOnboarding, useMe, useSaveStep, type OnboardingSettings } from './api.ts'
import { FinishStep } from './FinishStep.tsx'
import { GoalsStep } from './GoalsStep.tsx'
import { HabitsStep } from './HabitsStep.tsx'

const TOTAL = 9

/**
 * The onboarding (PRD F2): nine steps, one question per screen, progress as the tide line. Every step
 * but the first can be skipped, and the step it reached is stored, so an abort comes back to it.
 */
export function OnboardingPage() {
  const { t } = useTranslation('onboarding')
  const me = useMe()
  const today = useToday()
  const patchTask = usePatchTask()
  const queryClient = useQueryClient()
  const router = useRouter()
  const saveStep = useSaveStep()
  const finish = useFinishOnboarding()
  const lines = useDumpLines()
  const dump = useDumpActions()
  const dumpSubmit = useDumpSubmit()
  const [step, setStep] = useState<number | null>(null)
  const [firstGoalId, setFirstGoalId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Resume where the last visit stopped; a finished onboarding never lands here (the root layout).
  useEffect(() => {
    if (step !== null || !me.data) return
    const stored = me.data.settings.onboardingStep
    setStep(stored >= 2 && stored <= 8 ? stored : 1)
  }, [me.data, step])

  if (!me.data || step === null) {
    return <p className="text-body text-ink-2">{t('loading')}</p>
  }

  const settings: OnboardingSettings = me.data.settings
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone

  const go = async (next: number) => {
    setError(null)
    try {
      if (next <= 8) await saveStep.mutateAsync(next)
      setStep(next)
    } catch {
      setError(t('errors.generic'))
    }
  }

  const start = async () => {
    setError(null)
    try {
      if (settings.timezone !== timezone) await patchSettings({ timezone })
      await go(2)
    } catch {
      setError(t('errors.generic'))
    }
  }

  const done = async () => {
    setError(null)
    try {
      await finish.mutateAsync()
      await router.navigate({ to: '/today' })
    } catch {
      setError(t('errors.generic'))
    }
  }

  const view: TodayView | undefined = today.data
  const onTriage = async (id: string, answer: TriageAnswer) => {
    await triageTask(id, answer)
    await queryClient.invalidateQueries({ queryKey: ['today'] })
  }
  const onChooseAnchor = async (id: string, replace: boolean): Promise<'ok' | 'conflict'> => {
    try {
      await patchTask.mutateAsync({ id, patch: replace ? { anchor: true, replaceAnchor: true } : { anchor: true } })
      return 'ok'
    } catch (failure) {
      if (failure instanceof ApiError && failure.code === 'anchor_exists') return 'conflict'
      throw failure
    }
  }

  const entries: DumpEntry[] = (lines.data ?? []).map((line) => ({
    id: line.id,
    text: line.text,
    taskId: line.taskId,
    pending: false,
  }))

  return (
    <div className="fixed inset-0 z-40 flex flex-col overflow-y-auto bg-ground px-4 py-6">
      <div className="mx-auto flex w-full max-w-content flex-1 flex-col gap-8">
        <OnboardingProgress done={step - 1} total={TOTAL} />

        {error ? (
          <p role="alert" className="text-small text-danger">
            {error}
          </p>
        ) : null}

        {step === 1 ? (
          <div className="flex flex-1 flex-col gap-6">
            <div className="flex flex-col gap-2">
              <h1 className="text-title">{t('welcome.title')}</h1>
              <p className="max-w-[65ch] text-body text-ink-2">{t('welcome.text')}</p>
              <p className="text-meta text-ink-3">{t('welcome.timezoneNote', { timezone })}</p>
            </div>
            <Button type="button" className="mt-auto min-h-14" onClick={() => void start()}>
              {t('welcome.start')}
            </Button>
          </div>
        ) : null}

        {step === 2 ? (
          <GoalsStep
            onDone={(goals) => {
              setFirstGoalId(goals[0]?.id ?? null)
              void go(3)
            }}
          />
        ) : null}

        {step === 3 ? <HabitsStep goalId={firstGoalId} onDone={() => void go(4)} /> : null}

        {step === 4 ? (
          <div className="flex flex-1 flex-col gap-6">
            <p className="text-question">{t('dump.question')}</p>
            {entries.length === 0 ? <DumpPrompts /> : null}
            <DumpComposer onSubmit={dumpSubmit.submit} busy={dumpSubmit.busy} error={dumpSubmit.error} />
            <div className="mt-auto flex flex-wrap gap-2">
              <Button type="button" className="min-h-14" onClick={() => void go(5)}>
                {t('dump.continue')}
              </Button>
              <Button type="button" variant="ghost" className="min-h-14" onClick={() => void go(5)}>
                {t('dump.skip')}
              </Button>
            </div>
          </div>
        ) : null}

        {step === 5 ? (
          <div className="flex flex-1 flex-col gap-6">
            <p className="text-question">{t('toTasks.question')}</p>
            {entries.length === 0 ? (
              <p className="max-w-[65ch] text-body text-ink-2">{t('toTasks.empty')}</p>
            ) : (
              <DumpList entries={entries} onToTask={dump.toTask} onArchive={dump.archive} />
            )}
            <div className="mt-auto flex flex-wrap gap-2">
              <Button type="button" className="min-h-14" onClick={() => void go(6)}>
                {t('toTasks.continue')}
              </Button>
              <Button type="button" variant="ghost" className="min-h-14" onClick={() => void go(6)}>
                {t('toTasks.skip')}
              </Button>
            </div>
          </div>
        ) : null}

        {step === 6 ? (
          view ? (
            // Step 6 sorts and ends on "Choose your anchor" itself (TriageFlow), so step 7 is
            // covered by the screen that just answered it.
            <TriageFlow view={view} onTriage={onTriage} onChooseAnchor={onChooseAnchor} onDone={() => void go(8)} />
          ) : (
            <p className="text-body text-ink-2">{t('loading')}</p>
          )
        ) : null}

        {step === 8 ? <FinishStep settings={settings} onDone={() => void done()} /> : null}
      </div>
    </div>
  )
}

/** The tide line as progress, without step numbers (DESIGN §5). */
function OnboardingProgress({ done, total }: { done: number; total: number }) {
  const { t } = useTranslation('onboarding')
  const fraction = Math.min(1, done / total)

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
