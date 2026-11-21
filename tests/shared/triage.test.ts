import { describe, expect, it } from 'vitest'
import { triagePatch } from '../../src/shared/triage.ts'

const TODAY = '2026-11-21'

describe('triagePatch', () => {
  it('must today keeps the chosen block and marks the task as must', () => {
    expect(triagePatch({ kind: 'must_today', slot: 'block2' }, TODAY)).toStrictEqual({
      doDate: TODAY,
      slot: 'block2',
      must: true,
    })
  })

  it('today schedules it for today in the chosen block', () => {
    expect(triagePatch({ kind: 'today', slot: 'block4' }, TODAY)).toStrictEqual({
      doDate: TODAY,
      slot: 'block4',
    })
  })

  it('later picks a future date and clears must and anchor', () => {
    expect(triagePatch({ kind: 'later', date: '2026-11-24' }, TODAY)).toStrictEqual({
      doDate: '2026-11-24',
      slot: 'inbox',
      must: false,
      anchor: false,
    })
  })

  it('errand leaves the day empty and moves it to errands', () => {
    expect(triagePatch({ kind: 'errand' }, TODAY)).toStrictEqual({
      doDate: null,
      slot: 'errands',
      must: false,
      anchor: false,
    })
  })

  it('rejects later with today', () => {
    expect(() => triagePatch({ kind: 'later', date: TODAY }, TODAY)).toThrow(RangeError)
    expect(() => triagePatch({ kind: 'later', date: TODAY }, TODAY)).toThrow('later_must_be_future')
  })

  it('rejects later with yesterday', () => {
    expect(() => triagePatch({ kind: 'later', date: '2026-11-20' }, TODAY)).toThrow('later_must_be_future')
  })

  it('rejects later with a malformed date instead of guessing', () => {
    expect(() => triagePatch({ kind: 'later', date: '24.11.2026' }, TODAY)).toThrow(RangeError)
  })
})
