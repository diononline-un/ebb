import type { DayEnergy, Energy, RitualDone } from '../../../shared/schemas/day.ts'
import type { Tx } from '../../db.ts'

// Energy check and ritual for the user's day. The row usually exists (start-day.ts creates it),
// but an upsert keeps both calls correct when it does not.

export async function setEnergy(tx: Tx, today: string, energy: Energy): Promise<DayEnergy> {
  await tx`
    insert into day_entry (date, energy) values (${today}, ${energy})
    on conflict (user_id, date) do update set energy = excluded.energy`
  return { date: today, energy }
}

/** Marks today's ritual as done. The first time wins, so a second tap changes nothing. */
export async function finishRitual(tx: Tx, today: string): Promise<RitualDone> {
  const [row] = await tx<{ ritualDoneAt: Date }[]>`
    insert into day_entry (date, ritual_done_at) values (${today}, now())
    on conflict (user_id, date) do update set ritual_done_at = coalesce(day_entry.ritual_done_at, excluded.ritual_done_at)
    returning ritual_done_at`
  if (!row) throw new Error('day_entry upsert returned nothing')
  return { date: today, ritualDoneAt: row.ritualDoneAt.toISOString() }
}
