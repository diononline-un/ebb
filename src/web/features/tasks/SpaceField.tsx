import { useTranslation } from 'react-i18next'
import type { Task } from '../../../shared/schemas/task.ts'
import { useSpaces } from '../spaces/api.ts'

export type SpaceFieldProps = {
  task: Task
}

/**
 * Where the task lives. The heading carries the whole section: the assignee field under it belongs
 * to the same thought.
 *
 * shortcut: PATCH /api/tasks takes no spaceId, so the space is shown and not changed. Give it a
 * picker once the API moves a task between spaces.
 */
export function SpaceField({ task }: SpaceFieldProps) {
  const { t } = useTranslation('tasks-extra')
  const spaces = useSpaces()
  const space = spaces.data?.find((entry) => entry.id === task.spaceId) ?? null

  if (!space) return null

  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-heading">{t('space.heading')}</h3>
      <div className="flex flex-col gap-1">
        <span className="text-small text-ink-2">{t('space.label')}</span>
        <p className="text-body text-ink">{space.name}</p>
      </div>
    </section>
  )
}
