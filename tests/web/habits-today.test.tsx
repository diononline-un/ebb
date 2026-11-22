// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { HabitToday } from '../../src/shared/schemas/habits.ts'
import { HabitsToday } from '../../src/web/features/habits/HabitsToday.tsx'
import { i18nReady } from '../../src/web/lib/i18n.ts'

beforeAll(async () => {
  await i18nReady
})

afterEach(cleanup)

function habit(patch: Partial<HabitToday> = {}): HabitToday {
  return {
    id: crypto.randomUUID(),
    goalId: null,
    name: 'Ten minutes of tidying',
    cadence: 'daily',
    weeklyTarget: null,
    weekdays: null,
    reminderTime: null,
    position: 0,
    archivedAt: null,
    createdAt: '2026-11-22T09:00:00.000Z',
    doneToday: false,
    week: { done: 3, target: 7 },
    ...patch,
  }
}

describe('HabitsToday', () => {
  it('ticks a habit off and shows the week without blame', () => {
    const tidy = habit()
    const onToggle = vi.fn()
    const { getByLabelText, getByText } = render(<HabitsToday habits={[tidy]} onToggle={onToggle} />)

    expect(getByText('Habits today')).toBeTruthy()
    expect(getByText('3 of 7 this week')).toBeTruthy()

    fireEvent.click(getByLabelText('Mark Ten minutes of tidying as done today'))
    expect(onToggle).toHaveBeenCalledWith(tidy)
  })

  it('offers the way back for a habit that was already ticked', () => {
    const done = habit({ doneToday: true, week: { done: 4, target: 7 } })
    const onToggle = vi.fn()
    const { getByLabelText, getByText } = render(<HabitsToday habits={[done]} onToggle={onToggle} />)

    expect(getByText('4 of 7 this week')).toBeTruthy()
    fireEvent.click(getByLabelText('Take the tick back for Ten minutes of tidying'))
    expect(onToggle).toHaveBeenCalledWith(done)
  })

  it('shows nothing on a day without habits', () => {
    const { container } = render(<HabitsToday habits={[]} onToggle={() => {}} />)
    expect(container.textContent).toBe('')
  })
})
