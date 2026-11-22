import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Task } from '../../../shared/schemas/task.ts'
import { apiFetch, ApiError } from '../../lib/api.ts'
import { Button } from '../../ui/Button.tsx'
import { useMembers, useSpaces } from '../spaces/api.ts'
import { patchTask } from './api.ts'

/** Pulls a free task to yourself; the server says 409 once somebody else was faster. */
export function useClaim() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => apiFetch<Task>(`/api/tasks/${id}/claim`, { method: 'POST' }),
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['today'] }),
        queryClient.invalidateQueries({ queryKey: ['tasks'] }),
        queryClient.invalidateQueries({ queryKey: ['spaces'] }),
      ])
    },
  })
}

export type AssigneeFieldProps = {
  task: Task
}

/** Who carries the task: only a shared space has somebody to hand it to (PRD F13). */
export function AssigneeField({ task }: AssigneeFieldProps) {
  const { t } = useTranslation('tasks-extra')
  const queryClient = useQueryClient()
  const spaces = useSpaces()
  const space = spaces.data?.find((entry) => entry.id === task.spaceId) ?? null
  // A personal task belongs to its owner, so the people of the space are not asked for.
  const members = useMembers(space?.kind === 'shared' ? task.spaceId : null)
  const claim = useClaim()
  const [error, setError] = useState<string | null>(null)

  const assign = useMutation({
    mutationFn: ({ id, assigneeId }: { id: string; assigneeId: string | null }) =>
      patchTask(id, { assigneeId }),
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['today'] }),
        queryClient.invalidateQueries({ queryKey: ['tasks'] }),
        queryClient.invalidateQueries({ queryKey: ['spaces'] }),
      ])
    },
  })

  // Only a shared space has somebody to hand the task to.
  if (space?.kind !== 'shared') return null

  const report = (failure: unknown) => {
    const code = failure instanceof ApiError ? failure.code : 'generic'
    setError(t(`errors.${code}`, { defaultValue: t('errors.generic') }))
  }

  const choose = async (assigneeId: string) => {
    setError(null)
    try {
      await assign.mutateAsync({ id: task.id, assigneeId: assigneeId || null })
    } catch (failure) {
      report(failure)
    }
  }

  const take = async () => {
    setError(null)
    try {
      await claim.mutateAsync(task.id)
    } catch (failure) {
      report(failure)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor="task-assignee" className="text-small text-ink-2">
        {t('space.assigneeLabel')}
      </label>
      <select
        id="task-assignee"
        value={task.assigneeId ?? ''}
        onChange={(event) => void choose(event.target.value)}
        className="min-h-11 rounded-control border border-line bg-surface-sunken px-3 text-body text-ink"
      >
        <option value="">{t('space.nobody')}</option>
        {(members.data ?? []).map((member) => (
          <option key={member.userId} value={member.userId}>
            {member.name || member.email}
          </option>
        ))}
      </select>

      {task.assigneeId === null ? (
        <Button type="button" variant="secondary" onClick={() => void take()}>
          {t('space.take')}
        </Button>
      ) : null}

      {error ? (
        <p role="alert" className="text-small text-danger">
          {error}
        </p>
      ) : null}
    </div>
  )
}
