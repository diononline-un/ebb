import { env } from '../env.ts'

// E8-P6: the one place that talks to Paddle. Tests replace the client, so no run ever reaches the
// network (docs/specs/E08-billing.md).

export type PaddleSubscriptionPatch = {
  items: { price_id: string; quantity: number }[]
  custom_data: Record<string, unknown>
  proration_billing_mode: 'prorated_immediately'
}

export type PaddleClient = {
  updateSubscription(id: string, body: PaddleSubscriptionPatch): Promise<void>
}

/** Paddle answered with a status other than 2xx. The body stays out of the log. */
export class PaddleError extends Error {
  readonly status: number

  constructor(status: number) {
    super(`Paddle answered ${status}`)
    this.name = 'PaddleError'
    this.status = status
  }
}

// `undefined` means "build from the environment"; `null` means the tests want no client at all.
let override: PaddleClient | null | undefined

/** Tests hand in a recording fake; null means "no Paddle configured". */
export function setPaddleClientForTests(client: PaddleClient | null): void {
  override = client
}

export function paddleClient(): PaddleClient | null {
  if (override !== undefined) return override

  const key = env.PADDLE_API_KEY
  if (!key) return null
  const base = key.startsWith('pdl_sdbx_') ? 'https://sandbox-api.paddle.com' : 'https://api.paddle.com'

  return {
    async updateSubscription(id, body) {
      const response = await fetch(`${base}/subscriptions/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
        body: JSON.stringify(body),
        // A billing call that never answers would hold the request; ten seconds is plenty for Paddle.
        signal: AbortSignal.timeout(10_000),
      })
      if (!response.ok) throw new PaddleError(response.status)
    },
  }
}
