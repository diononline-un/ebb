import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { addDays, dayOfWeek } from '../../../shared/day.ts'
import type { Task, TaskPatch } from '../../../shared/schemas/task.ts'
import { useTaskList } from '../plan/api.ts'
import { deleteTask, usePatchTask, useToday, type TaskPatcher } from '../tasks/api.ts'
import { TaskRow } from '../tasks/TaskRow.tsx'
import { TaskSheet } from '../tasks/TaskSheet.tsx'
import { useErrandsDow } from './api.ts'

/** Errands live on their own page (E5): what is still to fetch, and what was done in the last week. */
export function ErrandsPage() {
  const { t } = useTranslation('errands')
  const open = useTaskList('errands')
  const done = useTaskList('done')
  const day = useToday()
  const dow = useErrandsDow()
  const patchTask = usePatchTask()
  const queryClient = useQueryClient()
  const [selectedId, setSelectedId] = useState<string | null>(null)

  if (open.isPending || done.isPending) return <p className="text-body text-ink-2">{t('loading')}</p>
  if (!open.data || !done.data) return <p className="text-body text-ink-2">{t('loadError')}</p>

  const today = day.data?.date ?? ''
  const openTasks = open.data.groups.flatMap((group) => group.tasks)
  const since = today ? addDays(today, -7) : ''
  // The done view already splits by the day it was planned for; a task without a day keeps its place.
  const doneErrands = done.data.groups.flatMap((group) =>
    group.tasks.filter((task) => task.slot === 'errands' && (group.date === null || group.date >= since)),
  )
  const selected = [...openTasks, ...doneErrands].find((task) => task.id === selectedId) ?? null
  const errandDay = today !== '' && dow.data !== undefined && dow.data !== null && dayOfWeek(today) === dow.data

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['tasks'] })
    await queryClient.invalidateQueries({ queryKey: ['today'] })
  }

  const patch: TaskPatcher = async (id: string, body: TaskPatch) => {
    const result = await patchTask.mutateAsync({ id, patch: body })
    await queryClient.invalidateQueries({ queryKey: ['tasks'] })
    return result
  }

  const toggle = (task: Task) => {
    void patch(task.id, { status: task.status === 'done' ? 'todo' : 'done' })
  }

  const remove = async (id: string) => {
    await deleteTask(id)
    await refresh()
  }

  return (
    <section className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-title">{t('title')}</h1>
        {errandDay ? <p className="text-meta text-ink-2">{t('dayLine', { count: openTasks.length })}</p> : null}
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-heading">{t('openHeading')}</h2>
        {openTasks.length === 0 ? (
          <p className="max-w-[65ch] text-body text-ink-2">{t('empty')}</p>
        ) : (
          <ul className="flex flex-col">
            {openTasks.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                today={today}
                onToggle={toggle}
                onOpen={(entry) => setSelectedId(entry.id)}
              />
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-heading">{t('doneHeading')}</h2>
        {doneErrands.length === 0 ? (
          <p className="max-w-[65ch] text-body text-ink-2">{t('emptyDone')}</p>
        ) : (
          <ul className="flex flex-col">
            {doneErrands.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                today={today}
                onToggle={toggle}
                onOpen={(entry) => setSelectedId(entry.id)}
              />
            ))}
          </ul>
        )}
      </div>

      <TaskSheet
        task={selected}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null)
        }}
        onPatch={patch}
        onDelete={remove}
      />
    </section>
  )
}
