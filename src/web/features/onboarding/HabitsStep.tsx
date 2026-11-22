import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../../ui/Button.tsx'
import { Input } from '../../ui/Input.tsx'
import { useCreateHabit } from '../habits/api.ts'

const HABIT_LIMIT = 2

export type HabitsStepProps = {
  /** The first goal of the step before, so a habit starts out hanging on something. */
  goalId: string | null
  onDone: () => void
}

/** Step 3: one or two habits, never more ("Fang klein an, später kannst du mehr anlegen"). */
export function HabitsStep({ goalId, onDone }: HabitsStepProps) {
  const { t } = useTranslation('onboarding')
  const create = useCreateHabit()
  const suggestions = t('habitSuggestions', { returnObjects: true }) as string[]
  const [chosen, setChosen] = useState<string[]>([])
  const [own, setOwn] = useState('')
  const [busy, setBusy] = useState(false)

  const toggle = (name: string) => {
    setChosen((current) =>
      current.includes(name)
        ? current.filter((value) => value !== name)
        : current.length >= HABIT_LIMIT ? current : [...current, name],
    )
  }

  const addOwn = () => {
    const name = own.trim()
    if (!name || chosen.includes(name) || chosen.length >= HABIT_LIMIT) return
    setChosen((current) => [...current, name])
    setOwn('')
  }

  const finish = async () => {
    setBusy(true)
    try {
      for (const name of chosen) {
        await create.mutateAsync({ name, cadence: 'daily', ...(goalId ? { goalId } : {}) })
      }
      onDone()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-6">
      <div className="flex flex-col gap-2">
        <p className="text-question">{t('habits.question')}</p>
        <p className="text-small text-ink-2">{t('habits.hint')}</p>
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-meta text-ink-3">{t('habits.suggestionsLabel')}</p>
        <div className="flex flex-wrap gap-2">
          {suggestions.map((name) => (
            <Button
              key={name}
              type="button"
              variant={chosen.includes(name) ? 'secondary' : 'ghost'}
              aria-pressed={chosen.includes(name)}
              onClick={() => toggle(name)}
            >
              {name}
            </Button>
          ))}
        </div>
        {chosen.length >= HABIT_LIMIT ? <p className="text-small text-ink-2">{t('habits.limit')}</p> : null}
      </div>

      <form
        className="flex flex-col gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          addOwn()
        }}
      >
        <label htmlFor="onboarding-habit" className="text-small text-ink-2">
          {t('habits.ownLabel')}
        </label>
        <Input
          id="onboarding-habit"
          value={own}
          maxLength={80}
          placeholder={t('habits.ownPlaceholder')}
          onChange={(event) => setOwn(event.target.value)}
        />
      </form>

      <div className="mt-auto flex flex-wrap gap-2">
        <Button type="button" className="min-h-14" disabled={busy || chosen.length === 0} onClick={() => void finish()}>
          {t('habits.continue')}
        </Button>
        <Button type="button" variant="ghost" className="min-h-14" onClick={onDone}>
          {t('habits.skip')}
        </Button>
      </div>
    </div>
  )
}
