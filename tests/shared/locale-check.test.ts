import { describe, expect, it } from 'vitest'
import { compareLocale, placeholdersOf, pluralBase } from '../../src/shared/locale-check.ts'

describe('placeholdersOf', () => {
  it('lists the placeholders sorted, so a swapped order is no finding', () => {
    expect(placeholdersOf('{{count}} of {{total}}')).toEqual(['count', 'total'])
    expect(placeholdersOf('{{total}} of {{count}}')).toEqual(['count', 'total'])
  })

  it('returns an empty list for text without placeholders', () => {
    expect(placeholdersOf('Save')).toEqual([])
  })
})

describe('pluralBase', () => {
  it.each([
    ['tasks.count_one', 'tasks.count'],
    ['tasks.count_other', 'tasks.count'],
    ['tasks.count_few', 'tasks.count'],
  ])('strips the suffix of %s', (key, base) => {
    expect(pluralBase(key)).toBe(base)
  })

  it.each(['tasks.count', 'tasks.count_one_half', 'tasks.count_'])('returns null for %s', (key) => {
    expect(pluralBase(key)).toBeNull()
  })
})

describe('compareLocale', () => {
  it('reports a lost {{count}}', () => {
    const result = compareLocale({ 'tasks:done': '{{count}} tasks done' }, { 'tasks:done': 'Aufgaben erledigt' })
    expect(result).toEqual({ missing: [], extra: [], placeholderMismatch: ['tasks:done'] })
  })

  it('reports a gained placeholder', () => {
    const result = compareLocale({ 'tasks:done': 'Tasks done' }, { 'tasks:done': '{{count}} Aufgaben erledigt' })
    expect(result.placeholderMismatch).toEqual(['tasks:done'])
  })

  it('accepts swapped placeholders and a different surrounding text', () => {
    const en = { 'tasks:of': '{{count}} of {{total}}' }
    const other = { 'tasks:of': 'von {{total}}: {{count}}' }
    const result = compareLocale(en, other)
    expect(result).toEqual({ missing: [], extra: [], placeholderMismatch: [] })
  })

  it('reports a missing and an extra key', () => {
    const en = { 'common:save': 'Save', 'common:cancel': 'Cancel' }
    const other = { 'common:save': 'Speichern', 'common:open': 'Öffnen' }
    const expected = { missing: ['common:cancel'], extra: ['common:open'], placeholderMismatch: [] }
    expect(compareLocale(en, other)).toEqual(expected)
  })

  it('accepts a language with only _other against en with _one and _other', () => {
    const en = {
      'tasks:count_one': '{{count}} task',
      'tasks:count_other': '{{count}} tasks',
    }
    const ja = {
      'tasks:count_other': '{{count}}件のタスク',
    }
    expect(compareLocale(en, ja)).toEqual({ missing: [], extra: [], placeholderMismatch: [] })
  })

  it('reports a base that no plural form of the target covers', () => {
    const result = compareLocale({ 'tasks:count_one': '{{count}} task' }, { 'tasks:other_count': 'x' })
    expect(result.missing).toEqual(['tasks:count_one'])
  })

  it('compares placeholders per plural form', () => {
    const en = { 'tasks:count_one': '{{count}} task', 'tasks:count_other': '{{count}} tasks' }
    const de = { 'tasks:count_one': '{{count}} Aufgabe', 'tasks:count_other': 'Aufgaben' }
    expect(compareLocale(en, de).placeholderMismatch).toEqual(['tasks:count_other'])
  })
})
