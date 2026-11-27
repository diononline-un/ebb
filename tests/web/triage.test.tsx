// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { i18nReady } from '../../src/web/lib/i18n.ts'
import { TriageFlow } from '../../src/web/features/triage/TriageFlow.tsx'
import type { TriageFlowProps } from '../../src/web/features/triage/TriageFlow.tsx'
import type { Task, TodayView } from '../../src/shared/schemas/task.ts'

beforeAll(async () => {
  await i18nReady
})

afterEach(() => {
  cleanup()
})

function makeTask(id: string, title: string): Task {
  return {
    id,
    spaceId: 'space-1',
    createdBy: 'user-1',
    assigneeId: 'user-1',
    title,
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
}

function makeView(inbox: Task[]): TodayView {
  return {
    date: '2026-11-21',
    energy: null,
    rolledCount: 0,
    anchor: null,
    must: [],
    slots: { inbox, block1: [], block2: [], block3: [], block4: [] },
    errandsOpen: 0,
    doneToday: [],
    ritualDoneAt: null,
  }
}

const props = (view: TodayView): TriageFlowProps => ({
  view,
  onTriage: vi.fn(async () => {}),
  onChooseAnchor: vi.fn(async (): Promise<'ok'> => 'ok'),
  onDone: vi.fn(),
})

describe('TriageFlow', () => {
  it('sends the block as part of the must answer', async () => {
    const task = makeTask('task-1', 'write the invoice')
    const flowProps = props(makeView([task]))
    const { getByText } = render(<TriageFlow {...flowProps} />)

    expect(getByText("What breaks if this waits until tomorrow?")).toBeTruthy()
    expect(getByText('write the invoice')).toBeTruthy()

    fireEvent.click(getByText("Something real, it's a must today"))
    expect(getByText('Which block?')).toBeTruthy()

    fireEvent.click(getByText('Block 2'))

    await waitFor(() => expect(flowProps.onTriage).toHaveBeenCalledTimes(1))
    expect(flowProps.onTriage).toHaveBeenCalledWith('task-1', { kind: 'must_today', slot: 'block2' })
  })

  it('sends an errand in one step', async () => {
    const task = makeTask('task-2', 'buy stamps')
    const flowProps = props(makeView([task]))
    const { getByText } = render(<TriageFlow {...flowProps} />)

    fireEvent.click(getByText("It's a small errand"))

    await waitFor(() => expect(flowProps.onTriage).toHaveBeenCalledTimes(1))
    expect(flowProps.onTriage).toHaveBeenCalledWith('task-2', { kind: 'errand' })
  })

  it('offers the anchor choice right away when the inbox is empty', () => {
    const flowProps = props(makeView([]))
    const { getByText } = render(<TriageFlow {...flowProps} />)

    expect(getByText('Choose your anchor')).toBeTruthy()
    expect(getByText('Skip')).toBeTruthy()
    expect(flowProps.onTriage).not.toHaveBeenCalled()
  })
})
