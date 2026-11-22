import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Goal } from '../../../shared/schemas/goals.ts'
import { Button } from '../../ui/Button.tsx'
import { Input } from '../../ui/Input.tsx'
import { useCreateGoal } from '../goals/api.ts'

const GOAL_LIMIT = 3

export type GoalsStepProps = {
  /** The goals this step created, so the habit step can hang itself on one. */
  onDone: (goals: Goal[]) => void
}

/** Step 2: one to three goals, from suggestions or written by hand (PRD F2). */
export function GoalsStep({ onDone }: GoalsStepProps) {
  const { t } = useTranslation('onboarding')
  const create = useCreateGoal()
  const suggestions = t('goalSuggestions', { returnObjects: true }) as string[]
  const [chosen, setChosen] = useState<string[]>([])
  const [own, setOwn] = useState('')
  const [busy, setBusy] = useState(false)

  const toggle = (title: string) => {
    setChosen((current) =>
      current.includes(title)
        ? current.filter((value) => value !== title)
        : current.length >= GOAL_LIMIT ? current : [...current, title],
    )
  }

  const addOwn = () => {
    const title = own.trim()
    if (!title || chosen.includes(title) || chosen.length >= GOAL_LIMIT) return
    setChosen((current) => [...current, title])
    setOwn('')
  }

  const finish = async () => {
    setBusy(true)
    try {
      const created: Goal[] = []
      for (const title of chosen) created.push(await create.mutateAsync({ title }))
      onDone(created)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-6">
      <div className="flex flex-col gap-2">
        <p className="text-question">{t('goals.question')}</p>
        <p className="text-small text-ink-2">{t('goals.hint')}</p>
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-meta text-ink-3">{t('goals.suggestionsLabel')}</p>
        <div className="flex flex-wrap gap-2">
          {suggestions.map((title) => (
            <Button
              key={title}
              type="button"
              variant={chosen.includes(title) ? 'secondary' : 'ghost'}
              aria-pressed={chosen.includes(title)}
              onClick={() => toggle(title)}
            >
              {title}
            </Button>
          ))}
        </div>
        {chosen.length >= GOAL_LIMIT ? <p className="text-small text-ink-2">{t('goals.limit')}</p> : null}
      </div>

      <form
        className="flex flex-col gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          addOwn()
        }}
      >
        <label htmlFor="onboarding-goal" className="text-small text-ink-2">
          {t('goals.ownLabel')}
        </label>
        <Input
          id="onboarding-goal"
          value={own}
          maxLength={80}
          placeholder={t('goals.ownPlaceholder')}
          onChange={(event) => setOwn(event.target.value)}
        />
      </form>

      <div className="mt-auto flex flex-wrap gap-2">
        <Button type="button" className="min-h-14" disabled={busy || chosen.length === 0} onClick={() => void finish()}>
          {t('goals.continue')}
        </Button>
        <Button type="button" variant="ghost" className="min-h-14" onClick={() => onDone([])}>
          {t('goals.skip')}
        </Button>
      </div>
    </div>
  )
}
