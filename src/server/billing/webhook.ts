import type { AppContext } from '../app-env.ts'
import { withSystem } from '../db.ts'
import { verifySignature } from './signature.ts'

/** Paddle payloads are small; anything above a megabyte is not ours. */
const MAX_BYTES = 1024 * 1024

type EventEnvelope = {
  event_id?: unknown
  event_type?: unknown
  occurred_at?: unknown
  data?: unknown
}

/**
 * Stores the event and answers 200 right away (E8-P2): the job does the work, so a slow apply can
 * never make Paddle retry a delivery that was already safely on disk.
 */
export async function receiveWebhook(c: AppContext, secret: string): Promise<Response> {
  const raw = await c.req.text()
  if (raw.length > MAX_BYTES) return c.json({ code: 'payload_too_large' }, 413)

  const check = verifySignature(secret, c.req.header('paddle-signature'), raw, Math.floor(Date.now() / 1000))
  if (!check.ok) return c.json({ code: 'invalid_signature' }, 401)

  let event: EventEnvelope
  try {
    event = JSON.parse(raw) as EventEnvelope
  } catch {
    return c.json({ code: 'invalid_body', fields: { _: ['invalid_json'] } }, 400)
  }

  const eventId = typeof event.event_id === 'string' ? event.event_id : ''
  const type = typeof event.event_type === 'string' ? event.event_type : ''
  const occurredAt = typeof event.occurred_at === 'string' ? new Date(event.occurred_at) : null
  if (!eventId || !type || !occurredAt || Number.isNaN(occurredAt.getTime())) {
    return c.json({ code: 'invalid_body', fields: { event_id: ['required'] } }, 400)
  }

  // System role: the store belongs to the billing path, not to the person the event is about.
  await withSystem(
    (tx) => tx`
      insert into billing_event (event_id, type, occurred_at, payload)
      values (${eventId}, ${type}, ${occurredAt}, ${raw}::text::jsonb)
      on conflict (event_id) do nothing`,
  )
  return c.json({ received: true })
}
