import { isBefore } from './day.ts'

export type BlockSlot = 'block1' | 'block2' | 'block3' | 'block4'
export type TriageSlot = BlockSlot | 'inbox' | 'errands'

export type TriageAnswer =
  | { kind: 'must_today'; slot: BlockSlot }
  | { kind: 'later'; date: string }
  | { kind: 'errand' }
  | { kind: 'today'; slot: BlockSlot }

/**
 * Fields an answer changes, and nothing else. Declared here instead of imported from
 * src/shared/schemas/task.ts: that schema belongs to E2-P1 and this package has to stand alone.
 * The shapes are compatible, so E2-P1 can hand it to TaskPatch unchanged.
 */
export type TriagePatch = {
  doDate: string | null
  slot: TriageSlot
  must?: boolean
  anchor?: boolean
}

/** The answers of "What breaks if this waits until tomorrow?" as field changes (docs/specs/E02-kern.md). */
export function triagePatch(answer: TriageAnswer, today: string): TriagePatch {
  switch (answer.kind) {
    case 'must_today':
      return { doDate: today, slot: answer.slot, must: true }
    case 'today':
      return { doDate: today, slot: answer.slot }
    case 'later':
      if (!isBefore(today, answer.date)) throw new RangeError('later_must_be_future')
      return { doDate: answer.date, slot: 'inbox', must: false, anchor: false }
    case 'errand':
      return { doDate: null, slot: 'errands', must: false, anchor: false }
  }
}
