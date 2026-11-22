// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { ProjectProgress } from '../../src/web/features/projects/api.ts'
import { doneOfTotal } from '../../src/web/features/projects/api.ts'
import { ProjectSheet } from '../../src/web/features/projects/ProjectSheet.tsx'
import { ApiError } from '../../src/web/lib/api.ts'
import { i18nReady } from '../../src/web/lib/i18n.ts'

const spies = vi.hoisted(() => ({ create: vi.fn(), patch: vi.fn(), remove: vi.fn() }))

const goal = vi.hoisted(() => ({
  id: '11111111-1111-4111-8111-111111111111',
  title: 'Be calmer at work',
  why: '',
  status: 'active',
  position: 0,
  createdAt: '2026-11-22T09:00:00.000Z',
}))

// The helpers of the module stay real, only the hooks that talk to the server are replaced.
vi.mock('../../src/web/features/projects/api.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/web/features/projects/api.ts')>()),
  useCreateProject: () => ({ mutateAsync: spies.create }),
  usePatchProject: () => ({ mutateAsync: spies.patch }),
  useDeleteProject: () => ({ mutateAsync: spies.remove }),
}))

vi.mock('../../src/web/features/goals/api.ts', () => ({
  useGoals: () => ({ data: [goal], isPending: false }),
}))

beforeAll(async () => {
  await i18nReady
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('ProjectSheet', () => {
  it('creates a project with the fields that were filled in', async () => {
    spies.create.mockResolvedValue({})
    const onOpenChange = vi.fn()
    const { getByLabelText, getByRole } = render(
      <ProjectSheet open onOpenChange={onOpenChange} project={null} />,
    )

    fireEvent.change(getByLabelText('Project'), { target: { value: 'Move house' } })
    fireEvent.change(getByLabelText('Goal'), { target: { value: goal.id } })
    fireEvent.change(getByLabelText('Deadline'), { target: { value: '2026-12-01' } })
    fireEvent.click(getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(spies.create).toHaveBeenCalledTimes(1))
    expect(spies.create).toHaveBeenCalledWith({
      name: 'Move house',
      goalId: goal.id,
      startDate: null,
      deadline: '2026-12-01',
    })
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('keeps a quiet line when the project is gone', async () => {
    spies.create.mockRejectedValue(new ApiError(422, 'unknown_project'))
    const { getByLabelText, getByRole, findByRole } = render(
      <ProjectSheet open onOpenChange={() => {}} project={null} />,
    )

    fireEvent.change(getByLabelText('Project'), { target: { value: 'Old idea' } })
    fireEvent.click(getByRole('button', { name: 'Save' }))

    const alert = await findByRole('alert')
    expect(alert.textContent).toBe('That project is not there any more.')
  })

  it('turns the ratio of the list into done and total', () => {
    const entry = (progress: number | null, openCount: number): ProjectProgress =>
      ({
        project: {
          id: '22222222-2222-4222-8222-222222222222',
          spaceId: '33333333-3333-4333-8333-333333333333',
          goalId: null,
          name: 'Move house',
          status: 'active',
          startDate: null,
          deadline: null,
          createdAt: '2026-11-22T09:00:00.000Z',
        },
        progress,
        openCount,
        warnings: [],
      })

    expect(doneOfTotal(entry(4 / 9, 5))).toEqual({ done: 4, total: 9 })
    expect(doneOfTotal(entry(0, 3))).toEqual({ done: 0, total: 3 })
    // No tasks and a finished project carry no numbers, the list says so in words instead.
    expect(doneOfTotal(entry(null, 0))).toBeNull()
    expect(doneOfTotal(entry(1, 0))).toBeNull()
  })
})
