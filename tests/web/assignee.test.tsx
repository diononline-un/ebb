// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Member, Space } from '../../src/shared/schemas/spaces.ts'
import type { Task } from '../../src/shared/schemas/task.ts'
import { TaskSheet } from '../../src/web/features/tasks/TaskSheet.tsx'
import { i18nReady } from '../../src/web/lib/i18n.ts'

const shared: Space = {
  id: '22222222-2222-4222-8222-222222222222',
  name: 'Move house',
  kind: 'shared',
  role: 'member',
  memberCount: 2,
}

const personal: Space = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Just me',
  kind: 'personal',
  role: 'owner',
  memberCount: 1,
}

const members: Member[] = [
  { userId: 'user-1', email: 'ada@example.test', name: 'Ada', role: 'owner', joinedAt: '2026-11-22T09:00:00.000Z' },
  { userId: 'user-2', email: 'ben@example.test', name: 'Ben', role: 'member', joinedAt: '2026-11-22T09:00:00.000Z' },
]

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: '33333333-3333-4333-8333-333333333333',
    spaceId: shared.id,
    createdBy: 'user-1',
    assigneeId: null,
    title: 'Pack the kitchen',
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
    ...overrides,
  }
}

const state = vi.hoisted(() => ({ spaces: [] as Space[] }))

const spies = vi.hoisted(() => ({
  patchTask: vi.fn(),
  patch: vi.fn(),
  addSubtask: vi.fn(),
  createRecurrence: vi.fn(),
}))

vi.mock('../../src/web/features/tasks/api.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/web/features/tasks/api.ts')>()),
  // The sheet saves through the page, but the two new fields write on their own; both land here.
  patchTask: spies.patchTask,
  usePatchTask: () => ({ mutateAsync: spies.patch }),
  useAddSubtask: () => ({ mutateAsync: spies.addSubtask }),
  useCreateRecurrence: () => ({ mutateAsync: spies.createRecurrence }),
  useTaskDetail: () => ({ data: { subtasks: [], progress: null }, isPending: false }),
  useRecurrences: () => ({ data: [] }),
  useToday: () => ({ data: { date: '2026-11-22' } }),
}))

vi.mock('../../src/web/features/spaces/api.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/web/features/spaces/api.ts')>()),
  useSpaces: () => ({ data: state.spaces, isPending: false }),
  useMembers: () => ({ data: members, isPending: false }),
}))

beforeAll(async () => {
  await i18nReady
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.unstubAllGlobals()
  state.spaces = []
})

function withClient(children: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}>{children}</QueryClientProvider>)
}

function openSheet(task: Task) {
  return withClient(
    <TaskSheet
      task={task}
      onOpenChange={() => {}}
      onPatch={async () => ({ task, warnings: [] })}
      onDelete={async () => {}}
    />,
  )
}

describe('AssigneeField', () => {
  it('saves the person with assigneeId', async () => {
    state.spaces = [shared]
    const task = makeTask({ assigneeId: 'user-1' })
    spies.patchTask.mockResolvedValue({ task, warnings: [] })
    const { getByLabelText, queryByRole } = openSheet(task)

    fireEvent.change(getByLabelText('Responsible'), { target: { value: 'user-2' } })

    await waitFor(() => expect(spies.patchTask).toHaveBeenCalledTimes(1))
    expect(spies.patchTask).toHaveBeenCalledWith(task.id, { assigneeId: 'user-2' })
    // An assigned task is nobody's to take, so the button stays out.
    expect(queryByRole('button', { name: 'Take this one' })).toBeNull()
  })

  it('hands the task back to nobody', async () => {
    state.spaces = [shared]
    const task = makeTask({ assigneeId: 'user-2' })
    spies.patchTask.mockResolvedValue({ task, warnings: [] })
    const { getByLabelText } = openSheet(task)

    fireEvent.change(getByLabelText('Responsible'), { target: { value: '' } })

    await waitFor(() => expect(spies.patchTask).toHaveBeenCalledTimes(1))
    expect(spies.patchTask).toHaveBeenCalledWith(task.id, { assigneeId: null })
  })

  it('hides the field in a personal space', () => {
    state.spaces = [personal]
    const { queryByLabelText } = openSheet(makeTask({ spaceId: personal.id }))

    expect(queryByLabelText('Responsible')).toBeNull()
  })
})

describe('claim', () => {
  it('takes a free task over the claim endpoint', async () => {
    state.spaces = [shared]
    const stub = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => ({
      ok: true,
      status: 200,
      json: async () => makeTask({ assigneeId: 'user-1' }),
    }))
    vi.stubGlobal('fetch', stub)
    const task = makeTask()
    const { getByRole } = openSheet(task)

    fireEvent.click(getByRole('button', { name: 'Take this one' }))

    await waitFor(() => expect(stub).toHaveBeenCalledTimes(1))
    expect(stub.mock.calls[0]?.[0]).toBe(`/api/tasks/${task.id}/claim`)
    expect(stub.mock.calls[0]?.[1]?.method).toBe('POST')
  })
})
