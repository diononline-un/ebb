import { applyEvent } from '../billing/apply.ts'
import { withSystem } from '../db.ts'
import { env } from '../env.ts'

// E8-P3: the webhook only stores; this job turns the stored events into subscriptions. It runs in the
// system role (the store belongs to the billing path), in the order Paddle sent them, and marks every
// event either processed or failed so one broken payload cannot block the queue.

export type BillingJobResult = { processed: number; failed: number; lastError?: string }

type EventRow = { id: string; eventId: string; type: string; payload: { data?: unknown } }

export async function processBillingEvents(limit = 50): Promise<BillingJobResult> {
  const events = await withSystem(
    (tx) => tx<EventRow[]>`
      select id, event_id, type, payload from billing_event
       where processed_at is null and failed_at is null
       order by occurred_at, id
       limit ${limit}`,
  )

  let processed = 0
  let failed = 0
  let lastError: string | undefined

  for (const event of events) {
    try {
      // One transaction per event: a half-applied subscription is worse than a retried event.
      await withSystem(async (tx) => {
        await applyEvent(tx, event.type, event.payload, { seatPriceId: env.PADDLE_PRICE_SEAT ?? null })
        await tx`update billing_event set processed_at = now() where id = ${event.id}`
      })
      processed += 1
    } catch (error) {
      failed += 1
      lastError = error instanceof Error ? error.message : String(error)
      await withSystem(
        (tx) => tx`update billing_event set failed_at = now(), failure = ${lastError ?? ''} where id = ${event.id}`,
      )
    }
  }

  return { processed, failed, ...(lastError ? { lastError } : {}) }
}

/** Starts the loop the server runs; 30 s is plenty for billing, and the job is cheap when empty. */
export function startBillingJob(intervalMs = 30_000): () => void {
  const timer = setInterval(() => {
    void processBillingEvents().catch((error: unknown) => {
      console.error('billing job failed', error)
    })
  }, intervalMs)
  timer.unref()
  return () => clearInterval(timer)
}
