// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { dayOfWeek } from '../../src/shared/day.ts'
import type { Task } from '../../src/shared/schemas/task.ts'
import { ErrandsPage } from '../../src/web/features/errands/ErrandsPage.tsx'
import { i18nReady } from '../../src/web/lib/i18n.ts'

const TODAY = '2026-11-22'

const state = vi.hoisted(() => ({
  open: [] as Task[],
  done: [] as { date: string | null; tasks: Task[] }[],
  dow: null as number | null,
}))

const spies = vi.hoisted(() => ({ patch: vi.fn() }))

vi.mock('../../src/web/features/plan/api.ts', () => ({
  useTaskList: (view: string) => ({
    data: view === 'errands' ? { view, groups: [{ date: null, tasks: state.open }] } : { view, groups: state.done },
    isPending: false,
  }),
}))

vi.mock('../../src/web/features/tasks/api.ts', () => ({
  usePatchTask: () => ({ mutateAsync: spies.patch }),
  useToday: () => ({ data: { date: '2026-11-22' } }),
  deleteTask: vi.fn(),
}))

vi.mock('../../src/web/features/errands/api.ts', () => ({
  useErrandsDow: () => ({ data: state.dow }),
}))

beforeAll(async () => {
  await i18nReady
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  state.open = []
  state.done = []
  state.dow = null
})

function withClient(children: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}>{children}</QueryClientProvider>)
}

function errand(patch: Partial<Task> = {}): Task {
  return {
    id: crypto.randomUUID(),
    spaceId: '77777777-7777-4777-8777-777777777777',
    createdBy: 'user-1',
    assigneeId: 'user-1',
    title: 'pick up the parcel',
    notes: '',
    nextStep: '',
    status: 'todo',
    doDate: TODAY,
    deadline: null,
    must: false,
    slot: 'errands',
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

describe('ErrandsPage', () => {
  it('keeps the open errands apart from the ones done in the last seven days', () => {
    state.open = [errand({ title: 'pick up the parcel' })]
    state.done = [
      {
        date: '2026-11-21',
        tasks: [
          errand({ title: 'buy stamps', status: 'done' }),
          // Same day, but not an errand: it belongs to the block list, not here.
          errand({ title: 'write the report', status: 'done', slot: 'block1' }),
        ],
      },
    ]

    const { getByText, queryByText } = withClient(<ErrandsPage />)

    expect(getByText('Open')).toBeTruthy()
    expect(getByText('Done in the last 7 days')).toBeTruthy()
    expect(getByText('pick up the parcel')).toBeTruthy()
    expect(getByText('buy stamps')).toBeTruthy()
    expect(queryByText('write the report')).toBeNull()
  })

  it('ticks an errand off through the task patch', async () => {
    const parcel = errand({ title: 'pick up the parcel' })
    state.open = [parcel]
    spies.patch.mockResolvedValue({ task: { ...parcel, status: 'done' }, warnings: [] })

    const { getByLabelText } = withClient(<ErrandsPage />)

    fireEvent.click(getByLabelText('Mark pick up the parcel as done'))

    await waitFor(() => expect(spies.patch).toHaveBeenCalledTimes(1))
    expect(spies.patch).toHaveBeenCalledWith({ id: parcel.id, patch: { status: 'done' } })
  })

  it('says it is errand day only on the configured weekday', () => {
    state.open = [errand(), errand({ title: 'buy stamps' })]
    state.dow = dayOfWeek(TODAY)

    const { getByText, queryByText, unmount } = withClient(<ErrandsPage />)

    expect(getByText('Errand day · 2 errands')).toBeTruthy()
    unmount()

    state.dow = (dayOfWeek(TODAY) + 1) % 7
    const other = withClient(<ErrandsPage />)
    expect(other.queryByText(/Errand day/)).toBeNull()
    expect(queryByText(/Errand day/)).toBeNull()
  })
})
