import { DndContext, KeyboardSensor, MouseSensor, TouchSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { useQueryClient } from '@tanstack/react-query'
import { Link, useRouter } from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Task, TaskPatch, TodayView } from '../../../shared/schemas/task.ts'
import { ApiError } from '../../lib/api.ts'
import { Button } from '../../ui/Button.tsx'
import { TideLine } from '../../ui/TideLine.tsx'
import { CurrentFocusTimer } from '../focus/FocusTimer.tsx'
import { ritualSkipped, useSetEnergy } from '../ritual/api.ts'
import { deleteTask, usePatchTask, useToday } from '../tasks/api.ts'
import { TaskSheet } from '../tasks/TaskSheet.tsx'
import { AnchorBlock } from './AnchorBlock.tsx'
import { DoneToday } from './DoneToday.tsx'
import { ErrandsLine } from './ErrandsLine.tsx'
import { RolloverNote } from './RolloverNote.tsx'
import type { MoveTarget } from './MoveMenu.tsx'
import { TaskList } from './TaskList.tsx'
import { UndoBar } from './UndoBar.tsx'

type Bucket = 'inbox' | 'block1' | 'block2' | 'block3' | 'block4'

/** Moves a task between the cached slot lists so a drag or a menu pick lands before the server answers. */
function moveInView(view: TodayView, id: string, slot: Bucket): TodayView {
  const isIn = (task: Task) => task.id !== id
  const moved =
    [...view.slots.inbox, ...view.slots.block1, ...view.slots.block2, ...view.slots.block3, ...view.slots.block4].find(
      (task) => task.id === id,
    ) ?? null
  if (!moved) return view

  const slots = {
    inbox: view.slots.inbox.filter(isIn),
    block1: view.slots.block1.filter(isIn),
    block2: view.slots.block2.filter(isIn),
    block3: view.slots.block3.filter(isIn),
    block4: view.slots.block4.filter(isIn),
  }
  slots[slot] = [...slots[slot], { ...moved, slot }]
  return { ...view, slots }
}

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
  const { t: tLow } = useTranslation('low')
  const { t: tRitual } = useTranslation('ritual')
  const router = useRouter()
  const redirected = useRef(false)
  const query = useToday()
  const setEnergy = useSetEnergy()
  const patchTask = usePatchTask()
  const queryClient = useQueryClient()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [undo, setUndo] = useState<Task | null>(null)
  // Mouse drags start right away; a finger has to hold the grip for 250 ms first (E2-P8).
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  useEffect(() => {
    if (!undo) return
    const timer = window.setTimeout(() => setUndo(null), 5000)
    return () => window.clearTimeout(timer)
  }, [undo])

  // A fresh day opens the morning ritual once (E3-P2). Whoever left it gets the line below instead.
  useEffect(() => {
    if (redirected.current) return
    const view = query.data
    if (!view || view.ritualDoneAt !== null || ritualSkipped(view.date)) return
    redirected.current = true
    void router.navigate({ to: '/ritual' })
  }, [query.data, router])

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

  const move = (id: string, target: MoveTarget) => {
    const body: TaskPatch = 'doDate' in target ? { doDate: target.doDate } : { slot: target.slot, ...(target.position === undefined ? {} : { position: target.position }) }
    if ('slot' in target) {
      const cached = queryClient.getQueryData<TodayView>(['today'])
      if (cached && target.slot !== 'errands') queryClient.setQueryData(['today'], moveInView(cached, id, target.slot))
    }
    void patchTask.mutateAsync({ id, patch: body }).catch(() => {
      // The cache falls back in usePatchTask's onError and the refetch settles the final order.
    })
  }

  const locate = (taskId: string): { slot: Bucket; index: number } | null => {
    const lists: [Bucket, Task[]][] = [
      ['inbox', view.slots.inbox],
      ['block1', view.slots.block1],
      ['block2', view.slots.block2],
      ['block3', view.slots.block3],
      ['block4', view.slots.block4],
    ]
    for (const [slot, tasks] of lists) {
      const index = tasks.findIndex((task) => task.id === taskId)
      if (index >= 0) return { slot, index }
    }
    return null
  }

  const taskById = (id: string): Task | null =>
    [...view.must, ...view.slots.inbox, ...view.slots.block1, ...view.slots.block2, ...view.slots.block3, ...view.slots.block4].find(
      (task) => task.id === id,
    ) ?? null
  const titleOf = (id: string) => taskById(id)?.title ?? ''
  const zoneOf = (id: string) => {
    const bucket = locate(id)
    return bucket ? t(bucket.slot) : t('inboxHeading')
  }

  const dragEnd = (event: DragEndEvent) => {
    const active = locate(String(event.active.id))
    const over = event.over ? locate(String(event.over.id)) : null
    if (!active || !over) return
    if (active.slot === over.slot && active.index === over.index) return
    move(String(event.active.id), { slot: over.slot, position: over.index })
  }
  // The energy answer lands in the cache right away; the refetch settles it with the server's word.
  const chooseEnergy = (energy: 'low' | 'good') => {
    queryClient.setQueryData<TodayView>(['today'], (previous) => (previous ? { ...previous, energy } : previous))
    setEnergy.mutate(energy)
  }

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

      {view.ritualDoneAt === null && ritualSkipped(view.date) ? (
        <Link
          to="/ritual"
          className="flex min-h-11 items-center justify-between gap-3 rounded-control border border-line px-4 text-body motion-quick hover:bg-surface-2"
        >
          <span>{tRitual('startYourDay')}</span>
          <ArrowRight size={20} aria-hidden="true" />
        </Link>
      ) : null}

      <div className="flex flex-col gap-2">
        <p className="text-small text-ink-2">
          {view.energy ? t(`energy.${view.energy}`) : tRitual('energy.question')}
        </p>
        <div role="group" aria-label={tLow('toggle.label')} className="flex gap-2">
          <Button
            type="button"
            variant={view.energy === 'low' ? 'secondary' : 'ghost'}
            aria-pressed={view.energy === 'low'}
            onClick={() => chooseEnergy('low')}
          >
            {tLow('toggle.low')}
          </Button>
          <Button
            type="button"
            variant={view.energy === 'good' ? 'secondary' : 'ghost'}
            aria-pressed={view.energy === 'good'}
            onClick={() => chooseEnergy('good')}
          >
            {tLow('toggle.good')}
          </Button>
        </div>
        {view.energy === 'low' ? (
          <Link to="/low" className="text-small text-ink-2 underline hover:text-ink">
            {tLow('link')}
          </Link>
        ) : null}
      </div>

      <RolloverNote count={view.rolledCount} date={view.date} />

      <CurrentFocusTimer />

      <AnchorBlock
        anchor={anchor}
        candidates={candidates}
        today={view.date}
        onToggle={toggle}
        onOpen={open}
        onChoose={chooseAnchor}
      />

      <TideLine animateIn={anchor !== null} />

      {view.slots.inbox.length > 0 && (
        <Link
          to="/triage"
          className="flex min-h-11 items-center justify-between gap-3 rounded-control border border-line px-4 text-body motion-quick hover:bg-surface-2"
        >
          <span>{t('sortInbox', { count: view.slots.inbox.length })}</span>
          <ArrowRight size={20} aria-hidden="true" />
        </Link>
      )}

      <DndContext
        sensors={sensors}
        onDragEnd={dragEnd}
        accessibility={{
          screenReaderInstructions: { draggable: t('move.instructions') },
          announcements: {
            onDragStart: ({ active }) => t('move.onDragStart', { title: titleOf(String(active.id)) }),
            onDragOver: ({ active, over }) =>
              t('move.onDragOver', { title: titleOf(String(active.id)), zone: zoneOf(over ? String(over.id) : '') }),
            onDragEnd: ({ active, over }) =>
              t('move.onDragEnd', { title: titleOf(String(active.id)), zone: zoneOf(over ? String(over.id) : '') }),
            onDragCancel: ({ active }) => t('move.onDragCancel', { title: titleOf(String(active.id)) }),
          },
        }}
      >
        <TaskList heading={t('inboxHeading')} tasks={view.slots.inbox} today={view.date} onToggle={toggle} onOpen={open} onMove={move} />
        <TaskList heading={t('mustHeading')} tasks={view.must} today={view.date} onToggle={toggle} onOpen={open} onMove={move} />
        <TaskList heading={t('block1')} slot="block1" tasks={view.slots.block1} today={view.date} onToggle={toggle} onOpen={open} onMove={move} />
        <TaskList heading={t('block2')} slot="block2" tasks={view.slots.block2} today={view.date} onToggle={toggle} onOpen={open} onMove={move} />
        <TaskList heading={t('block3')} slot="block3" tasks={view.slots.block3} today={view.date} onToggle={toggle} onOpen={open} onMove={move} />
        <TaskList heading={t('block4')} slot="block4" tasks={view.slots.block4} today={view.date} onToggle={toggle} onOpen={open} onMove={move} />
      </DndContext>

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
