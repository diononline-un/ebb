// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { FocusSession } from '../../src/shared/schemas/focus.ts'
import type { Task, TodayView } from '../../src/shared/schemas/task.ts'
import { LowMode } from '../../src/web/features/low/LowPage.tsx'
import { i18nReady } from '../../src/web/lib/i18n.ts'

// The running session and the stop call: this test decides what the server says.
const focus = vi.hoisted(() => ({
  current: null as FocusSession | null,
  stop: vi.fn(async (_id: string) => {}),
  mutate: vi.fn(),
}))

// The start button and the timer have their own tests; here they only have to exist without a query client.
vi.mock('../../src/web/features/focus/api.ts', () => ({
  useStartFocus: () => ({ mutate: () => {}, isPending: false }),
  useTimerDefault: () => 25,
  useCurrentFocus: () => ({ data: focus.current }),
  useStopFocus: () => ({ mutate: focus.mutate, mutateAsync: focus.stop }),
}))

beforeAll(async () => {
  await i18nReady
})

afterEach(() => {
  cleanup()
  focus.current = null
  focus.stop.mockReset()
  focus.mutate.mockReset()
})

/** A session that still has time left, so the timer does not end it on its own. */
function session(patch: Partial<FocusSession> = {}): FocusSession {
  return {
    id: '0b5f0a2e-4c66-4f6e-9e35-5a1c1d1f2a3b',
    taskId: null,
    slot: null,
    plannedMinutes: 10,
    startedAt: new Date().toISOString(),
    endedAt: null,
    ...patch,
  }
}

function task(title: string, patch: Partial<Task> = {}): Task {
  return {
    id: `task-${title}`,
    spaceId: 'space-1',
    createdBy: 'user-1',
    assigneeId: 'user-1',
    title,
    notes: '',
    nextStep: '',
    status: 'todo',
    doDate: '2026-11-22',
    deadline: null,
    must: false,
    slot: 'inbox',
    position: 0,
    anchor: false,
    pushCount: 0,
    projectId: null,
    parentId: null,
    recurrenceId: null,
    completedAt: null,
    createdAt: '2026-11-22T09:00:00.000Z',
    updatedAt: '2026-11-22T09:00:00.000Z',
    ...patch,
  }
}

function view(patch: Partial<TodayView> = {}): TodayView {
  return {
    date: '2026-11-22',
    energy: 'low',
    rolledCount: 0,
    anchor: null,
    must: [],
    slots: { inbox: [], block1: [], block2: [], block3: [], block4: [] },
    errandsOpen: 0,
    doneToday: [],
    ritualDoneAt: null,
    ...patch,
  }
}

describe('LowMode', () => {
  it('marks the task done and offers one more', async () => {
    const first = task('write the invoice')
    const second = task('buy stamps')
    const onPatch = vi.fn(async () => undefined)
    const onGoToToday = vi.fn()

    const { getByRole, getByText, rerender } = render(
      <LowMode view={view({ slots: { inbox: [first, second], block1: [], block2: [], block3: [], block4: [] } })} onPatch={onPatch} onGoToToday={onGoToToday} />,
    )

    expect(getByText('write the invoice')).toBeTruthy()
    fireEvent.click(getByRole('button', { name: 'Done' }))

    await waitFor(() => expect(onPatch).toHaveBeenCalledWith(first.id, { status: 'done' }))
    expect(getByText('Done. One more, or call it a day?')).toBeTruthy()

    // The server view no longer carries the finished task, so "One more" lands on the next one.
    rerender(
      <LowMode view={view({ slots: { inbox: [second], block1: [], block2: [], block3: [], block4: [] } })} onPatch={onPatch} onGoToToday={onGoToToday} />,
    )
    fireEvent.click(getByRole('button', { name: 'One more' }))
    expect(getByText('buy stamps')).toBeTruthy()
  })

  it('keeps what was reached as the next step', () => {
    const only = task('write the invoice')
    const onPatch = vi.fn(async () => undefined)
    const { getByLabelText } = render(
      <LowMode view={view({ slots: { inbox: [only], block1: [], block2: [], block3: [], block4: [] } })} onPatch={onPatch} onGoToToday={() => {}} />,
    )

    const field = getByLabelText('First 10-minute step')
    fireEvent.change(field, { target: { value: 'open the template' } })
    fireEvent.blur(field)

    expect(onPatch).toHaveBeenCalledWith(only.id, { nextStep: 'open the template' })
  })

  it('stops for today with a note for tomorrow', async () => {
    const only = task('write the invoice')
    const onPatch = vi.fn(async () => undefined)
    const onGoToToday = vi.fn()
    const { getByRole, getByLabelText } = render(
      <LowMode view={view({ slots: { inbox: [only], block1: [], block2: [], block3: [], block4: [] } })} onPatch={onPatch} onGoToToday={onGoToToday} />,
    )

    fireEvent.click(getByRole('button', { name: 'Stop for today' }))
    fireEvent.change(getByLabelText('Where did you stop?'), { target: { value: 'called the landlord' } })
    fireEvent.click(getByRole('button', { name: 'Save and stop' }))

    await waitFor(() => expect(onPatch).toHaveBeenCalledWith(only.id, { nextStep: 'called the landlord' }))
    expect(onGoToToday).toHaveBeenCalled()
  })

  it('stops the running session when its task is done', async () => {
    const only = task('write the invoice')
    const running = session({ taskId: only.id })
    focus.current = running
    const onPatch = vi.fn(async () => undefined)
    const { getByRole } = render(
      <LowMode view={view({ slots: { inbox: [only], block1: [], block2: [], block3: [], block4: [] } })} onPatch={onPatch} onGoToToday={() => {}} />,
    )

    fireEvent.click(getByRole('button', { name: 'Done' }))

    await waitFor(() => expect(onPatch).toHaveBeenCalledWith(only.id, { status: 'done' }))
    // useStopFocus POSTs /api/focus/<id>/stop with exactly this id.
    await waitFor(() => expect(focus.stop).toHaveBeenCalledWith(running.id))
  })

  it('leaves a session that belongs to another task running', async () => {
    const only = task('write the invoice')
    focus.current = session({ taskId: 'other-task-id' })
    const onPatch = vi.fn(async () => undefined)
    const { getByRole } = render(
      <LowMode view={view({ slots: { inbox: [only], block1: [], block2: [], block3: [], block4: [] } })} onPatch={onPatch} onGoToToday={() => {}} />,
    )

    fireEvent.click(getByRole('button', { name: 'Done' }))

    await waitFor(() => expect(onPatch).toHaveBeenCalledWith(only.id, { status: 'done' }))
    expect(focus.stop).not.toHaveBeenCalled()
  })
})
