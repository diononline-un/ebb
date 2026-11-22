// @ts-nocheck — the component under test is a .tsx module and tsconfig.server (which checks
// tests/) sets no jsx flag. Turning it on would change a config outside this package.
// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { createElement } from 'react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { i18nReady } from '../../src/web/lib/i18n.ts'
import { ApiError } from '../../src/web/lib/api.ts'
import { TaskSheetFields } from '../../src/web/features/tasks/TaskSheet.tsx'
import { z } from 'zod'
import {
  TaskResult as TaskResultSchema,
  type Task,
  type TaskPatch,
} from '../../src/shared/schemas/task.ts'

type TaskResult = z.infer<typeof TaskResultSchema>

beforeAll(async () => {
  await i18nReady
})

afterEach(() => {
  cleanup()
})

const TASK: Task = {
  id: crypto.randomUUID(),
  spaceId: crypto.randomUUID(),
  createdBy: 'user-1',
  assigneeId: 'user-1',
  title: 'write the invoice',
  notes: '',
  nextStep: '',
  status: 'todo',
  doDate: '2026-11-21',
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
  createdAt: '2026-11-21T09:00:00.000Z',
  updatedAt: '2026-11-21T09:00:00.000Z',
}

const result = (patch: TaskPatch): TaskResult => ({
  task: { ...TASK, anchor: patch.anchor ?? TASK.anchor },
  warnings: [],
})

describe('TaskSheetFields', () => {
  it('asks before replacing the anchor and then sends replaceAnchor', async () => {
    const onPatch = vi.fn(async (patch: TaskPatch): Promise<TaskResult> => {
      if (patch.anchor && !patch.replaceAnchor) throw new ApiError(409, 'anchor_exists')
      return result(patch)
    })

    const { getByLabelText, findByText, getByRole } = render(
      createElement(TaskSheetFields, {
        task: TASK,
        onPatch,
        onDelete: async () => {},
        onClose: () => {},
      }),
    )

    fireEvent.click(getByLabelText('Anchor'))

    const question = await findByText("Replace the current anchor?")
    expect(question).toBeTruthy()
    expect(onPatch).toHaveBeenCalledTimes(1)
    expect(onPatch).toHaveBeenLastCalledWith({ anchor: true })

    fireEvent.click(getByRole('button', { name: 'Replace' }))

    await waitFor(() => expect(onPatch).toHaveBeenCalledTimes(2))
    expect(onPatch).toHaveBeenLastCalledWith({ anchor: true, replaceAnchor: true })
  })

  it('keeps the calm hint when the fifth must is already there', async () => {
    const onPatch = vi.fn(async (): Promise<TaskResult> => {
      throw new ApiError(422, 'must_limit')
    })

    const { getByLabelText, findByRole } = render(
      createElement(TaskSheetFields, {
        task: TASK,
        onPatch,
        onDelete: async () => {},
        onClose: () => {},
      }),
    )

    fireEvent.click(getByLabelText('Must today'))

    const alert = await findByRole('alert')
    expect(alert.textContent).toContain('Five musts are enough for one day.')
  })

  it('shows the warnings the server sends back', async () => {
    const onPatch = vi.fn(async (patch: TaskPatch): Promise<TaskResult> => ({
      task: TASK,
      warnings: ['must_many'],
      ...patch,
    }))

    const { getByLabelText, findByText } = render(
      createElement(TaskSheetFields, {
        task: TASK,
        onPatch,
        onDelete: async () => {},
        onClose: () => {},
      }),
    )

    fireEvent.click(getByLabelText('Must today'))

    const warning = await findByText('That is a lot of musts for one day. Maybe one of them can wait.')
    expect(warning).toBeTruthy()
  })
})
