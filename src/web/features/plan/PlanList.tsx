import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Task, TaskPatch } from '../../../shared/schemas/task.ts'
import { SpaceNamesProvider, TaskRow } from '../tasks/TaskRow.tsx'
import { TaskSheet } from '../tasks/TaskSheet.tsx'
import { deleteTask, usePatchTask, useToday, type TaskPatcher } from '../tasks/api.ts'
import { formatDay, useTaskList, type ListView } from './api.ts'

/** One tab of the plan: a flat group or one group per day, empty states included. */
export function PlanList({ view }: { view: ListView }) {
  const { t, i18n } = useTranslation('plan')
  const query = useTaskList(view)
  const day = useToday()
  const patchTask = usePatchTask()
  const queryClient = useQueryClient()
  const [selectedId, setSelectedId] = useState<string | null>(null)

  if (query.isPending) {
    return <p className="text-body text-ink-2">{t('loading')}</p>
  }

  if (!query.data) {
    return <p className="text-body text-ink-2">{t('loadError')}</p>
  }

  const today = day.data?.date ?? ''
  const groups = query.data.groups
  const everything = groups.flatMap((group) => group.tasks)
  const selected = everything.find((task) => task.id === selectedId) ?? null

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
    const next = task.status === 'done' ? 'todo' : 'done'
    void patch(task.id, { status: next })
  }

  const remove = async (id: string) => {
    await deleteTask(id)
    await refresh()
  }

  if (everything.length === 0) {
    return <p className="max-w-[65ch] text-body text-ink-2">{t(`empty.${view}`)}</p>
  }

  return (
    <SpaceNamesProvider spaces={query.data.spaces}>
      <div className="flex flex-col gap-8">
        {groups.map((group) => (
          <section key={group.date ?? view} className="flex flex-col gap-2">
            {group.date ? <h2 className="text-heading">{formatDay(group.date, i18n.language)}</h2> : null}
            <ul className="flex flex-col">
              {group.tasks.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  today={today}
                  onToggle={toggle}
                  onOpen={(entry) => setSelectedId(entry.id)}
                  showPushCount
                />
              ))}
            </ul>
          </section>
        ))}

        <TaskSheet
          task={selected}
          onOpenChange={(open) => {
            if (!open) setSelectedId(null)
          }}
          onPatch={patch}
          onDelete={remove}
        />
      </div>
    </SpaceNamesProvider>
  )
}
