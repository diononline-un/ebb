// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Goal } from '../../src/shared/schemas/goals.ts'
import { ApiError } from '../../src/web/lib/api.ts'
import { i18nReady } from '../../src/web/lib/i18n.ts'
import { GoalSheet } from '../../src/web/features/goals/GoalSheet.tsx'

const spies = vi.hoisted(() => ({
  create: vi.fn(),
  patch: vi.fn(),
  remove: vi.fn(),
}))

vi.mock('../../src/web/features/goals/api.ts', () => ({
  useGoals: () => ({ data: [], isPending: false }),
  useCreateGoal: () => ({ mutateAsync: spies.create }),
  usePatchGoal: () => ({ mutateAsync: spies.patch }),
  useDeleteGoal: () => ({ mutateAsync: spies.remove }),
}))

beforeAll(async () => {
  await i18nReady
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const GOAL: Goal = {
  id: crypto.randomUUID(),
  title: 'Be calmer at work',
  why: 'The evenings are too short.',
  status: 'active',
  position: 0,
  createdAt: '2026-11-22T09:00:00.000Z',
}

describe('GoalSheet', () => {
  it('creates a goal from a title and a why', async () => {
    spies.create.mockResolvedValue(GOAL)
    const onOpenChange = vi.fn()
    const { getByLabelText, getByRole } = render(<GoalSheet open onOpenChange={onOpenChange} goal={null} />)

    fireEvent.change(getByLabelText('Goal'), { target: { value: 'Sleep more' } })
    fireEvent.change(getByLabelText('Why is this important to you?'), { target: { value: 'It decides the day.' } })
    fireEvent.click(getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(spies.create).toHaveBeenCalledTimes(1))
    expect(spies.create).toHaveBeenCalledWith({ title: 'Sleep more', why: 'It decides the day.', status: 'active' })
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('keeps the calm line when five goals are already active', async () => {
    spies.create.mockRejectedValue(new ApiError(422, 'too_many_goals'))
    const { getByLabelText, getByRole, findByRole } = render(<GoalSheet open onOpenChange={() => {}} goal={null} />)

    fireEvent.change(getByLabelText('Goal'), { target: { value: 'One too many' } })
    fireEvent.click(getByRole('button', { name: 'Save' }))

    const alert = await findByRole('alert')
    expect(alert.textContent).toBe('Five goals are enough for now. One of them can pause.')
  })

  it('edits a goal and deletes it after asking', async () => {
    spies.patch.mockResolvedValue(GOAL)
    spies.remove.mockResolvedValue(undefined)
    const onOpenChange = vi.fn()
    const { getByLabelText, getByRole, getByText } = render(<GoalSheet open onOpenChange={onOpenChange} goal={GOAL} />)

    expect((getByLabelText('Goal') as HTMLInputElement).value).toBe('Be calmer at work')
    fireEvent.change(getByLabelText('Goal'), { target: { value: 'Be calmer at home' } })
    fireEvent.click(getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(spies.patch).toHaveBeenCalledTimes(1))
    expect(spies.patch).toHaveBeenCalledWith({ id: GOAL.id, patch: { title: 'Be calmer at home', why: GOAL.why, status: 'active' } })

    fireEvent.click(getByRole('button', { name: 'Delete goal' }))
    expect(getByText('Delete this goal?')).toBeTruthy()
    fireEvent.click(getByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(spies.remove).toHaveBeenCalledWith(GOAL.id))
  })
})
