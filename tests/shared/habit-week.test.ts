import { describe, expect, it } from 'vitest'
import { habitWeek, isDue, weekTarget, type HabitRule } from '../../src/shared/habit-week.ts'

const daily: HabitRule = { cadence: 'daily', weeklyTarget: null, weekdays: null }
const mondayToFriday: HabitRule = { cadence: 'daily', weeklyTarget: null, weekdays: [1, 2, 3, 4, 5] }
const threeTimes: HabitRule = { cadence: 'weekly_count', weeklyTarget: 3, weekdays: null }

// 2026-11-16 is a Monday, so every offset 0…6 is a plain weekday.
const WEEK = '2026-11-16'

describe('isDue', () => {
  it('asks every day for a plain daily habit', () => {
    expect(isDue(daily, '2026-11-22')).toBe(true)
  })

  it('asks only on the chosen weekdays', () => {
    expect(isDue(mondayToFriday, '2026-11-16')).toBe(true) // Monday
    expect(isDue(mondayToFriday, '2026-11-21')).toBe(false) // Saturday
  })

  it('leaves the day open for a weekly count', () => {
    expect(isDue(threeTimes, '2026-11-21')).toBe(true)
  })
})

describe('weekTarget', () => {
  it('counts the seven days of a plain daily habit', () => {
    expect(weekTarget(daily)).toBe(7)
  })

  it('counts the chosen weekdays', () => {
    expect(weekTarget(mondayToFriday)).toBe(5)
    expect(weekTarget({ cadence: 'daily', weeklyTarget: null, weekdays: [1, 1, 3] })).toBe(2)
  })

  it('takes the target of a weekly count', () => {
    expect(weekTarget(threeTimes)).toBe(3)
    expect(weekTarget({ cadence: 'weekly_count', weeklyTarget: null, weekdays: null })).toBe(7)
  })
})

describe('habitWeek', () => {
  it('counts the logged days of the week', () => {
    expect(habitWeek(daily, ['2026-11-16', '2026-11-18', '2026-11-22'], WEEK)).toEqual({ done: 3, target: 7 })
  })

  it('ignores days outside the week', () => {
    expect(habitWeek(daily, ['2026-11-15', '2026-11-23', '2026-11-17'], WEEK)).toEqual({ done: 1, target: 7 })
  })

  it('counts only the days a weekday habit was due', () => {
    // Tuesday and Saturday are logged; only Tuesday counts for a Monday-to-Friday habit.
    expect(habitWeek(mondayToFriday, ['2026-11-17', '2026-11-21'], WEEK)).toEqual({ done: 1, target: 5 })
  })

  it('stops a weekly count at its target', () => {
    expect(habitWeek(threeTimes, ['2026-11-16', '2026-11-17', '2026-11-19', '2026-11-20'], WEEK)).toEqual({
      done: 3,
      target: 3,
    })
  })

  it('starts a new week at the given day', () => {
    // A Sunday week start: the same logs land in another week.
    expect(habitWeek(daily, ['2026-11-15', '2026-11-16'], '2026-11-15')).toEqual({ done: 2, target: 7 })
  })
})
