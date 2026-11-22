import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ResetAnswers, ResetPatch } from '../../../shared/schemas/reset.ts'
import { Button } from '../../ui/Button.tsx'
import { Textarea } from '../../ui/Textarea.tsx'

export type ReviewStepProps = {
  answers: ResetAnswers
  onSave: (patch: ResetPatch) => Promise<unknown>
  onNext: () => void
}

/**
 * Step 1: three questions about the week (PRD F12). Each field saves when it loses focus, so leaving
 * the screen halfway keeps whatever was written (E6).
 */
export function ReviewStep({ answers, onSave, onNext }: ReviewStepProps) {
  const { t } = useTranslation('reset')

  return (
    <div className="flex flex-col gap-8">
      <h2 className="text-heading">{t('review.question')}</h2>

      <ReviewField
        id="reset-went-well"
        label={t('review.wentWell')}
        initial={answers.wentWell}
        onSave={(text) => onSave({ wentWell: text })}
      />
      <ReviewField
        id="reset-went-badly"
        label={t('review.wentBadly')}
        initial={answers.wentBadly}
        onSave={(text) => onSave({ wentBadly: text })}
      />
      <ReviewField
        id="reset-change"
        label={t('review.change')}
        initial={answers.change}
        onSave={(text) => onSave({ change: text })}
      />

      <div>
        <Button type="button" variant="secondary" onClick={onNext}>
          {t('review.continue')}
        </Button>
      </div>
    </div>
  )
}

type ReviewFieldProps = {
  id: string
  label: string
  initial: string
  onSave: (text: string) => Promise<unknown>
}

/** One answer. The text stays in the field while the server catches up; only the last save counts. */
function ReviewField({ id, label, initial, onSave }: ReviewFieldProps) {
  const { t } = useTranslation('reset')
  const [value, setValue] = useState(initial)
  const [saved, setSaved] = useState(initial)
  const [failed, setFailed] = useState(false)

  const commit = () => {
    if (value === saved) return
    const next = value
    setFailed(false)
    onSave(next)
      .then(() => setSaved(next))
      .catch(() => setFailed(true))
  }

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-small text-ink-2">
        {label}
      </label>
      <Textarea
        id={id}
        value={value}
        maxLength={2000}
        rows={3}
        onChange={(event) => setValue(event.target.value)}
        onBlur={commit}
      />
      {failed ? (
        <p role="alert" className="text-small text-danger">
          {t('saveError')}
        </p>
      ) : null}
    </div>
  )
}
