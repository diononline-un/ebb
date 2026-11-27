import { withSystem } from '../../db.ts'

export type DeepHealth = { ok: boolean; db: boolean; billingLagSeconds: number | null }

// The billing queue counts as stuck when the oldest open event is older than this (docs/betrieb.md).
const MAX_BILLING_LAG_SECONDS = 600

/**
 * What the uptime monitor asks: is the database reachable, and does the billing queue move?
 * The system role is needed because the event store is closed to the request role (migration 0080).
 */
export async function deepHealth(): Promise<DeepHealth> {
  try {
    return await withSystem(async (tx) => {
      await tx`select 1`
      const [row] = await tx<{ lagSeconds: number | null }[]>`
        select extract(epoch from now() - min(received_at))::int as lag_seconds
          from billing_event
         where processed_at is null and failed_at is null`
      const lag = row?.lagSeconds ?? null
      return { ok: lag === null || lag <= MAX_BILLING_LAG_SECONDS, db: true, billingLagSeconds: lag }
    })
  } catch {
    // Database down or query failed: exactly what the monitor should see.
    return { ok: false, db: false, billingLagSeconds: null }
  }
}
