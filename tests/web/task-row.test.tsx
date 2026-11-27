// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { i18nReady } from '../../src/web/lib/i18n.ts'
import { TaskRow } from '../../src/web/features/tasks/TaskRow.tsx'
import type { Task } from '../../src/shared/schemas/task.ts'

beforeAll(async () => {
  await i18nReady
})

afterEach(() => {
  cleanup()
})

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: crypto.randomUUID(),
    spaceId: crypto.randomUUID(),
    createdBy: 'user-1',
    assigneeId: 'user-1',
    title: 'buy milk',
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
    ...overrides,
  }
}

function renderRow(task: Task, showPushCount = false) {
  const noop = vi.fn()
  const container = render(
    <ul>
      <TaskRow task={task} today="2026-11-21" onToggle={noop} onOpen={noop} showPushCount={showPushCount} />
    </ul>,
  )
  return container
}

describe('TaskRow', () => {
  it('marks a must with a dot and a text only screen readers see', () => {
    const { container } = renderRow(makeTask({ must: true }))

    expect(container.textContent).toContain('Must')

    const dot = container.querySelector('[aria-hidden="true"].size-2')
    expect(dot).not.toBeNull()
    expect(dot?.className).toContain('bg-ink')
  })

  it('shows a done task struck through in the muted ink', () => {
    const { container } = renderRow(makeTask({ status: 'done', completedAt: '2026-11-21T10:00:00.000Z' }))

    const title = container.querySelector('.line-through')
    expect(title?.textContent).toBe('buy milk')
    expect(title?.className).toContain('text-ink-3')
  })

  it('does not show the pushed counter on today', () => {
    const { container } = renderRow(makeTask({ pushCount: 4 }))
    expect(container.textContent).not.toContain('Moved')
  })

  it('shows the pushed counter when the view asks for it', () => {
    const { container } = renderRow(makeTask({ pushCount: 3 }), true)
    expect(container.textContent).toContain('Moved 3×')
  })

  it('warns about a deadline within two days', () => {
    const { container } = renderRow(makeTask({ deadline: '2026-11-22' }))
    const warn = container.querySelector('span.text-warn')
    expect(warn?.textContent).toMatch(/^Due on .*22/)
  })

  it('keeps quiet about a deadline far away', () => {
    const { container } = renderRow(makeTask({ deadline: '2026-12-24' }))
    expect(container.textContent).not.toContain('Due on')
  })
})
