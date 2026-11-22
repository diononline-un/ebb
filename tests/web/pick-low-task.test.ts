import { describe, expect, it } from 'vitest'
import type { Task, TodayView } from '../../src/shared/schemas/task.ts'
import { lowCandidates, pickLowTask } from '../../src/web/features/low/pickLowTask.ts'

function task(id: string, patch: Partial<Task> = {}): Task {
  return {
    id,
    spaceId: 'space-1',
    createdBy: 'user-1',
    assigneeId: 'user-1',
    title: id,
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

describe('pickLowTask', () => {
  it('takes the first must before everything else', () => {
    const must = task('must-1', { must: true })
    const anchor = task('anchor-1', { anchor: true })
    const picked = pickLowTask(
      view({ must: [must], anchor, slots: { inbox: [task('inbox-1')], block1: [task('block-1')], block2: [], block3: [], block4: [] } }),
    )
    expect(picked?.id).toBe('must-1')
  })

  it('takes the anchor before the inbox', () => {
    const anchor = task('anchor-1', { anchor: true })
    const picked = pickLowTask(
      view({ anchor, slots: { inbox: [task('inbox-1')], block1: [], block2: [], block3: [], block4: [] } }),
    )
    expect(picked?.id).toBe('anchor-1')
  })

  it('takes the inbox before the blocks', () => {
    const picked = pickLowTask(
      view({ slots: { inbox: [task('inbox-1')], block1: [task('block-1')], block2: [], block3: [], block4: [] } }),
    )
    expect(picked?.id).toBe('inbox-1')
  })

  it('walks the blocks in order', () => {
    const picked = pickLowTask(
      view({ slots: { inbox: [], block1: [], block2: [], block3: [task('block-3')], block4: [task('block-4')] } }),
    )
    expect(picked?.id).toBe('block-3')
  })

  it('answers null for a day without open tasks', () => {
    expect(pickLowTask(view())).toBeNull()
  })
})

describe('lowCandidates', () => {
  it('offers every open task once, in the order the mode would take them', () => {
    const ids = lowCandidates(
      view({
        must: [task('must-1', { must: true })],
        anchor: task('anchor-1', { anchor: true }),
        slots: {
          inbox: [task('inbox-1')],
          block1: [task('block-1')],
          block2: [],
          block3: [],
          block4: [task('block-4')],
        },
      }),
    ).map((item) => item.id)
    expect(ids).toEqual(['must-1', 'anchor-1', 'inbox-1', 'block-1', 'block-4'])
  })
})
