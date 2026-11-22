import type { Task, TodayView } from '../../../shared/schemas/task.ts'

/**
 * Everything a low-energy day may offer, in the order it offers it: the musts come first, then the
 * anchor, then the inbox, then the blocks (docs/specs/E03-energie.md).
 */
export function lowCandidates(view: TodayView): Task[] {
  return [
    ...view.must,
    ...(view.anchor ? [view.anchor] : []),
    ...view.slots.inbox,
    ...view.slots.block1,
    ...view.slots.block2,
    ...view.slots.block3,
    ...view.slots.block4,
  ]
}

/** The one thing of the day, or null when nothing is left. */
export function pickLowTask(view: TodayView): Task | null {
  return lowCandidates(view)[0] ?? null
}
