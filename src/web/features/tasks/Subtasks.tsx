import { useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { Task } from '../../../shared/schemas/task.ts'
import { ApiError } from '../../lib/api.ts'
import { Button } from '../../ui/Button.tsx'
import { Checkbox } from '../../ui/Checkbox.tsx'
import { Input } from '../../ui/Input.tsx'
import { useAddSubtask, usePatchTask, useTaskDetail } from './api.ts'

export type SubtasksProps = {
  task: Task
}

/** Subtasks of the open task (E5): x/y, the list with ticks, and one field to add another. */
export function Subtasks({ task }: SubtasksProps) {
  const { t } = useTranslation('tasks-extra')
  const detail = useTaskDetail(task.id)
  const add = useAddSubtask()
  const patch = usePatchTask()
  const queryClient = useQueryClient()
  const [title, setTitle] = useState('')
  const [error, setError] = useState<string | null>(null)

  const subtasks = detail.data?.subtasks ?? []
  const progress = detail.data?.progress ?? null

  const toggle = async (subtask: Task) => {
    await patch.mutateAsync({ id: subtask.id, patch: { status: subtask.status === 'done' ? 'todo' : 'done' } })
    await queryClient.invalidateQueries({ queryKey: ['tasks'] })
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const trimmed = title.trim()
    if (!trimmed) return
    setError(null)

    try {
      await add.mutateAsync({
        title: trimmed,
        parentId: task.id,
        // A subtask lives in the same space as its parent; a project only comes along when there is one.
        ...(task.projectId ? { projectId: task.projectId } : {}),
      })
      setTitle('')
    } catch (failure) {
      const code = failure instanceof ApiError ? failure.code : 'generic'
      setError(t(`errors.${code}`, { defaultValue: t('errors.generic') }))
    }
  }

  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-heading">{t('subtasks.heading')}</h3>
      {progress ? <p className="font-mono text-meta text-ink-3">{t('subtasks.progress', progress)}</p> : null}

      {subtasks.length === 0 ? (
        <p className="text-small text-ink-2">{t('subtasks.empty')}</p>
      ) : (
        <ul className="flex flex-col">
          {subtasks.map((subtask) => {
            const done = subtask.status === 'done'
            return (
              <li key={subtask.id} className="flex min-h-11 items-center gap-1">
                <Checkbox
                  checked={done}
                  onCheckedChange={() => void toggle(subtask)}
                  aria-label={t(done ? 'subtasks.markOpen' : 'subtasks.markDone', { title: subtask.title })}
                />
                <span className={done ? 'text-body text-ink-3 line-through' : 'text-body text-ink'}>
                  {subtask.title}
                </span>
              </li>
            )
          })}
        </ul>
      )}

      <form className="flex flex-col gap-1" onSubmit={(event) => void submit(event)}>
        <label htmlFor="subtask-title" className="text-small text-ink-2">
          {t('subtasks.addLabel')}
        </label>
        <div className="flex items-center gap-2">
          <Input id="subtask-title" value={title} maxLength={200} onChange={(event) => setTitle(event.target.value)} />
          <Button type="submit" variant="secondary" disabled={!title.trim()}>
            {t('subtasks.addAction')}
          </Button>
        </div>
      </form>

      {error ? (
        <p role="alert" className="text-small text-danger">
          {error}
        </p>
      ) : null}
    </section>
  )
}
