// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Task } from '../../src/shared/schemas/task.ts'
import { RecurrenceField } from '../../src/web/features/tasks/RecurrenceField.tsx'
import { Subtasks } from '../../src/web/features/tasks/Subtasks.tsx'
import { ApiError } from '../../src/web/lib/api.ts'
import { i18nReady } from '../../src/web/lib/i18n.ts'

const spies = vi.hoisted(() => ({
  add: vi.fn(),
  patch: vi.fn(),
  createRule: vi.fn(),
  detail: { subtasks: [] as Task[], progress: null as { done: number; total: number } | null },
  rules: [] as { id: string; rule: unknown }[],
}))

vi.mock('../../src/web/features/tasks/api.ts', () => ({
  useTaskDetail: () => ({ data: spies.detail }),
  useAddSubtask: () => ({ mutateAsync: spies.add }),
  usePatchTask: () => ({ mutateAsync: spies.patch }),
  useRecurrences: () => ({ data: spies.rules }),
  useCreateRecurrence: () => ({ mutateAsync: spies.createRule }),
  useToday: () => ({ data: { date: '2026-11-22' } }),
}))

beforeAll(async () => {
  await i18nReady
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  spies.detail.subtasks = []
  spies.detail.progress = null
  spies.rules = []
})

function withClient(children: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}>{children}</QueryClientProvider>)
}

const TASK: Task = {
  id: '44444444-4444-4444-8444-444444444444',
  spaceId: '55555555-5555-4555-8555-555555555555',
  createdBy: 'user-1',
  assigneeId: 'user-1',
  title: 'move house',
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
}

const subtask = (title: string, status: Task['status'] = 'todo'): Task => ({
  ...TASK,
  id: crypto.randomUUID(),
  title,
  status,
  parentId: TASK.id,
})

describe('Subtasks', () => {
  it('shows how many subtasks are done', () => {
    spies.detail.subtasks = [subtask('ask the landlord', 'done'), subtask('book the van'), subtask('pack')]
    spies.detail.progress = { done: 1, total: 3 }

    const { getByText } = withClient(<Subtasks task={TASK} />)

    expect(getByText('Subtasks')).toBeTruthy()
    expect(getByText('1 of 3 done')).toBeTruthy()
    expect(getByText('book the van')).toBeTruthy()
  })

  it('adds a subtask under the open task', async () => {
    spies.add.mockResolvedValue({})

    const { getByLabelText, getByRole } = withClient(<Subtasks task={TASK} />)

    fireEvent.change(getByLabelText('Add a subtask'), { target: { value: 'call the bank' } })
    fireEvent.click(getByRole('button', { name: 'Add' }))

    await waitFor(() => expect(spies.add).toHaveBeenCalledTimes(1))
    expect(spies.add).toHaveBeenCalledWith({ title: 'call the bank', parentId: TASK.id })
  })

  it('keeps a quiet line when the subtask would be a third level', async () => {
    spies.add.mockRejectedValue(new ApiError(422, 'subtask_too_deep'))

    const { getByLabelText, getByRole, findByRole } = withClient(<Subtasks task={TASK} />)

    fireEvent.change(getByLabelText('Add a subtask'), { target: { value: 'too deep' } })
    fireEvent.click(getByRole('button', { name: 'Add' }))

    const alert = await findByRole('alert')
    expect(alert.textContent).toBe('Subtasks go one level deep.')
  })
})

describe('RecurrenceField', () => {
  it('creates a weekly rule that starts today', async () => {
    spies.createRule.mockResolvedValue({})

    const { getByLabelText, getByRole, getAllByRole } = withClient(<RecurrenceField task={TASK} />)

    fireEvent.change(getByLabelText('Repeat'), { target: { value: 'weekly' } })
    // Sunday first, so index 1 is Monday.
    fireEvent.click(getAllByRole('checkbox')[1] ?? getByRole('checkbox'))
    fireEvent.click(getByRole('button', { name: 'Repeat from today' }))

    await waitFor(() => expect(spies.createRule).toHaveBeenCalledTimes(1))
    expect(spies.createRule).toHaveBeenCalledWith({
      title: TASK.title,
      rule: { freq: 'weekly', weekdays: [1] },
      startsOn: '2026-11-22',
    })
  })

  it('lists the rule the task came from', () => {
    const recurring: Task = { ...TASK, recurrenceId: '66666666-6666-4666-8666-666666666666' }
    spies.rules = [{ id: recurring.recurrenceId ?? '', rule: { freq: 'every_n_days', interval: 3 } }]

    const { getByText } = withClient(<RecurrenceField task={recurring} />)

    expect(getByText('Every 3 days')).toBeTruthy()
  })
})
