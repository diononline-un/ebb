import { z } from 'zod'
import type { Tx } from '../../db.ts'
import { env } from '../../env.ts'

// E10-P6: product events (PRD §10). They stay in our own database: no IP, no free text, and nothing
// at all in selfhost mode. The table `product_event` (0003) already carries the RLS policies and the
// name pattern, so this module only validates the payload and writes it in the request role.

/** The pattern of the table's check constraint, so a bad name is a 400 and not a database error. */
export const EventName = z.string().regex(/^[a-z][a-z0-9_.]{1,63}$/)

/**
 * Props are counters and short identifiers, never text a person typed: at most eight keys, each a
 * number, a boolean or a string up to 40 characters.
 */
export const EventInput = z.object({
  name: EventName,
  props: z
    .record(z.string().min(1).max(40), z.union([z.boolean(), z.number(), z.string().max(40)]))
    .refine((props) => Object.keys(props).length <= 8, { message: 'too_many_props' })
    .optional(),
})
export type EventInput = z.infer<typeof EventInput>

/**
 * Stores one event for the signed-in person; `app.uid()` and the RLS policy keep it there. The mode is
 * a parameter so the selfhost rule is testable, the same way `hasAccess` takes its facts.
 */
export async function trackEvent(tx: Tx, event: EventInput, mode: string = env.APP_MODE): Promise<void> {
  // Selfhost keeps no product events (PRD Datenschutz, E10-P6). The route still answers 204, so the
  // client needs no switch of its own.
  if (mode === 'selfhost') return
  // ::text::jsonb on purpose: postgres.js sends text, and a bare ::jsonb cast double-encodes it.
  await tx`
    insert into product_event (user_id, name, props)
    values (app.uid(), ${event.name}, ${JSON.stringify(event.props ?? {})}::text::jsonb)`
}
