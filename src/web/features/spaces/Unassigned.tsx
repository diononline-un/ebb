import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ApiError } from '../../lib/api.ts'
import { Button } from '../../ui/Button.tsx'
import { useClaim } from '../tasks/AssigneeField.tsx'
import { useUnassigned } from './api.ts'

export type UnassignedProps = {
  spaceId: string
}

/** The tasks of a shared space nobody took yet, each with one tap to take it (PRD F13). */
export function Unassigned({ spaceId }: UnassignedProps) {
  const { t } = useTranslation('spaces')
  const tasks = useUnassigned(spaceId)
  const claim = useClaim()
  const [error, setError] = useState<string | null>(null)

  const take = async (id: string) => {
    setError(null)
    try {
      await claim.mutateAsync(id)
    } catch (failure) {
      const code = failure instanceof ApiError ? failure.code : 'generic'
      setError(t(`errors.${code}`, { defaultValue: t('errors.generic') }))
    }
  }

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-heading">{t('unassignedHeading')}</h2>

      {tasks.isPending ? <p className="text-body text-ink-2">{t('loading')}</p> : null}
      {tasks.data?.length === 0 ? <p className="text-body text-ink-2">{t('unassignedEmpty')}</p> : null}

      <ul className="flex flex-col">
        {(tasks.data ?? []).map((task) => (
          <li
            key={task.id}
            className="flex min-h-13 items-center gap-3 border-b border-line py-1 last:border-b-0"
          >
            <span className="flex-1 py-1 text-body break-words text-ink">{task.title}</span>
            <Button type="button" variant="secondary" onClick={() => void take(task.id)}>
              {t('take')}
            </Button>
          </li>
        ))}
      </ul>

      {error ? (
        <p role="alert" className="text-small text-danger">
          {error}
        </p>
      ) : null}
    </section>
  )
}
