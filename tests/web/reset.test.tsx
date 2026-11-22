// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { ResetCurrent } from '../../src/shared/schemas/reset.ts'
import type { Task } from '../../src/shared/schemas/task.ts'
import { ResetFlow } from '../../src/web/features/reset/ResetPage.tsx'
import { ApiError } from '../../src/web/lib/api.ts'
import { i18nReady } from '../../src/web/lib/i18n.ts'

// The route page only wires queries to the flow, so the flow is driven here with plain callbacks: no
// query client, no fetch. The numbers and the sheet have their own callers.

beforeAll(async () => {
  await i18nReady
})

afterEach(() => {
  cleanup()
})

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
    pushCount: 3,
    projectId: null,
    parentId: null,
    recurrenceId: null,
    completedAt: null,
    createdAt: '2026-11-01T09:00:00.000Z',
    updatedAt: '2026-11-01T09:00:00.000Z',
    ...patch,
  }
}

function reset(patch: Partial<ResetCurrent> = {}): ResetCurrent {
  return {
    weekStart: '2026-11-16',
    weekEnd: '2026-11-22',
    step: 0,
    wentWell: '',
    wentBadly: '',
    change: '',
    completedAt: null,
    stats: {
      weekStart: '2026-11-16',
      weekEnd: '2026-11-22',
      anchorDays: 4,
      tasksDone: 12,
      habits: [{ habitId: 'habit-1', name: 'Water', goalId: null, week: { done: 5, target: 7 } }],
      projects: [{ projectId: 'project-1', name: 'Book', done: 3 }],
      focusMinutes: 240,
      rolledCount: 6,
    },
    stuck: [],
    outlook: [],
    ...patch,
  }
}

function flowProps(patch: Partial<ResetCurrent> = {}) {
  return {
    view: reset(patch),
    onSave: vi.fn(async () => undefined),
    onDecide: vi.fn(async () => undefined),
    onFinish: vi.fn(async () => undefined),
    onOpenTask: vi.fn(),
    onGoHistory: vi.fn(),
  }
}

describe('ResetFlow', () => {
  it('saves an answer when its field loses focus', async () => {
    const props = flowProps()
    const { getByLabelText } = render(<ResetFlow {...props} />)

    const field = getByLabelText('What went well?')
    fireEvent.change(field, { target: { value: 'two long walks' } })
    fireEvent.blur(field)

    await waitFor(() => expect(props.onSave).toHaveBeenCalledWith({ wentWell: 'two long walks' }))
  })

  it('shows the week in numbers, each figure with what it counts', () => {
    const props = flowProps({ step: 1 })
    const { getByText } = render(<ResetFlow {...props} />)

    expect(getByText('Anchor done on')).toBeTruthy()
    expect(getByText('4 of 7 days')).toBeTruthy()
    expect(getByText('12 tasks')).toBeTruthy()
    expect(getByText('5 of 7 this week')).toBeTruthy()
    expect(getByText('3 tasks done')).toBeTruthy()
  })

  it('takes one decision per stuck task', async () => {
    const stuck = task('move the shelf', { pushCount: 4 })
    const props = flowProps({ step: 2, stuck: [stuck] })
    const { getByRole, getByText } = render(<ResetFlow {...props} />)

    expect(getByText('move the shelf')).toBeTruthy()
    expect(getByText(/pushed 4×/)).toBeTruthy()

    fireEvent.click(getByRole('button', { name: 'Not today' }))

    await waitFor(() => expect(props.onDecide).toHaveBeenCalledWith(stuck.id, { decision: 'skip' }))
  })

  it('sends the flow back to the stuck tasks when one still waits', async () => {
    const stuck = task('move the shelf', { pushCount: 3 })
    const props = flowProps({ step: 3, stuck: [stuck] })
    props.onFinish.mockRejectedValueOnce(new ApiError(422, 'stuck_open'))
    const { getByRole, getByText, queryByText } = render(<ResetFlow {...props} />)

    fireEvent.click(getByRole('button', { name: 'Finish the week' }))

    await waitFor(() => expect(getByText('One task is still waiting for a decision.')).toBeTruthy())
    expect(getByText('What happens to these?')).toBeTruthy()
    expect(getByText('move the shelf')).toBeTruthy()
    expect(queryByText('Finish the week')).toBeNull()
  })
})
