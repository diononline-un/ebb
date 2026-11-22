import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Task, TaskPatch, TodayView } from '../../../shared/schemas/task.ts'
import { ApiError } from '../../lib/api.ts'
import { TideLine } from '../../ui/TideLine.tsx'
import { deleteTask, usePatchTask, useToday } from '../tasks/api.ts'
import { TaskSheet } from '../tasks/TaskSheet.tsx'
import { AnchorBlock } from './AnchorBlock.tsx'
import { DoneToday } from './DoneToday.tsx'
import { ErrandsLine } from './ErrandsLine.tsx'
import { RolloverNote } from './RolloverNote.tsx'
import { TaskList } from './TaskList.tsx'
import { UndoBar } from './UndoBar.tsx'

function findTask(view: TodayView, id: string | null): Task | null {
  if (!id) return null
  const everywhere = [
    ...(view.anchor ? [view.anchor] : []),
    ...view.must,
    ...view.slots.inbox,
    ...view.slots.block1,
    ...view.slots.block2,
    ...view.slots.block3,
    ...view.slots.block4,
    ...view.doneToday,
  ]
  return everywhere.find((task) => task.id === id) ?? null
}

/** The day, in the order of DESIGN.md §5: title, energy, anchor, tide line, musts, blocks, errands, done. */
export function TodayPage() {
  const { t, i18n } = useTranslation('today')
  const query = useToday()
  const patchTask = usePatchTask()
  const queryClient = useQueryClient()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [undo, setUndo] = useState<Task | null>(null)

  useEffect(() => {
    if (!undo) return
    const timer = window.setTimeout(() => setUndo(null), 5000)
    return () => window.clearTimeout(timer)
  }, [undo])

  if (query.isPending) {
    return <p className="text-body text-ink-2">{t('loading')}</p>
  }

  if (!query.data) {
    return <p className="text-body text-ink-2">{t('loadError')}</p>
  }

  const view = query.data
  const open = (task: Task) => setSelectedId(task.id)
  const candidates = [
    ...view.must,
    ...view.slots.inbox,
    ...view.slots.block1,
    ...view.slots.block2,
    ...view.slots.block3,
    ...view.slots.block4,
  ]

  // A finished anchor leaves the anchor field; the "done today" list still knows it was one.
  const anchor = view.anchor ?? view.doneToday.find((task) => task.anchor) ?? null
  const dateLabel = new Intl.DateTimeFormat(i18n.language, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(new Date(`${view.date}T00:00:00Z`))

  const toggle = (task: Task) => {
    const next = task.status === 'done' ? 'todo' : 'done'
    void patchTask
      .mutateAsync({ id: task.id, patch: { status: next } })
      .then(() => setUndo(next === 'done' ? task : null))
      .catch(() => setUndo(null))
  }

  const chooseAnchor = async (task: Task, replace: boolean): Promise<'ok' | 'conflict'> => {
    const patch: TaskPatch = replace ? { anchor: true, replaceAnchor: true } : { anchor: true }
    try {
      await patchTask.mutateAsync({ id: task.id, patch })
      return 'ok'
    } catch (error) {
      if (error instanceof ApiError && error.code === 'anchor_exists') return 'conflict'
      throw error
    }
  }

  const patch = (id: string, body: TaskPatch) => patchTask.mutateAsync({ id, patch: body })
  const remove = async (id: string) => {
    await deleteTask(id)
    await queryClient.invalidateQueries({ queryKey: ['today'] })
  }

  return (
    <section className="flex flex-col gap-8 lg:gap-12">
      <header className="flex flex-col gap-1">
        <h1 className="text-title">{t('title')}</h1>
        <p className="text-meta text-ink-3">{dateLabel}</p>
      </header>

      {view.energy ? <p className="text-small text-ink-2">{t(`energy.${view.energy}`)}</p> : null}

      <RolloverNote count={view.rolledCount} date={view.date} />

      <AnchorBlock
        anchor={anchor}
        candidates={candidates}
        today={view.date}
        onToggle={toggle}
        onOpen={open}
        onChoose={chooseAnchor}
      />

      <TideLine animateIn={anchor !== null} />

      <TaskList heading={t('mustHeading')} tasks={view.must} today={view.date} onToggle={toggle} onOpen={open} />
      <TaskList heading={t('block1')} tasks={view.slots.block1} today={view.date} onToggle={toggle} onOpen={open} />
      <TaskList heading={t('block2')} tasks={view.slots.block2} today={view.date} onToggle={toggle} onOpen={open} />
      <TaskList heading={t('block3')} tasks={view.slots.block3} today={view.date} onToggle={toggle} onOpen={open} />
      <TaskList heading={t('block4')} tasks={view.slots.block4} today={view.date} onToggle={toggle} onOpen={open} />

      <ErrandsLine count={view.errandsOpen} />

      <DoneToday tasks={view.doneToday} today={view.date} onToggle={toggle} onOpen={open} />

      <TaskSheet
        task={findTask(view, selectedId)}
        onOpenChange={(isOpen) => {
          if (!isOpen) setSelectedId(null)
        }}
        onPatch={patch}
        onDelete={remove}
      />

      {undo ? (
        <UndoBar
          onUndo={() => {
            void patchTask.mutateAsync({ id: undo.id, patch: { status: 'todo' } })
            setUndo(null)
          }}
          onClose={() => setUndo(null)}
        />
      ) : null}
    </section>
  )
}
