import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../src/server/app.ts'
import { closeDb, withSystem } from '../src/server/db.ts'
import { ownerSql, resetDb } from './harness.ts'

beforeEach(resetDb)
afterAll(async () => {
  await closeDb()
  await ownerSql.end()
})

describe('GET /api/health', () => {
  it('answers 200 with { ok: true }', async () => {
    const res = await createApp().request('/api/health')

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
  })

  it('answers unknown API paths with a JSON 404', async () => {
    const res = await createApp().request('/api/does-not-exist')

    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ code: 'not_found' })
  })
})

describe('GET /api/health/deep', () => {
  it('answers 200 with db: true while no billing event is open', async () => {
    const res = await createApp().request('/api/health/deep')

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, db: true, billingLagSeconds: null })
  })

  it('answers 503 when the oldest open billing event is twenty minutes old', async () => {
    // E9-P8: the monitor should notice a billing queue that stopped moving.
    await withSystem(
      (tx) => tx`
        insert into billing_event (event_id, type, occurred_at, payload, received_at)
        values ('evt_lag', 'subscription.updated', now() - interval '20 minutes', '{}'::jsonb,
                now() - interval '20 minutes')`,
    )

    const res = await createApp().request('/api/health/deep')
    const body = (await res.json()) as { ok: boolean; db: boolean; billingLagSeconds: number }

    expect(res.status).toBe(503)
    expect(body.ok).toBe(false)
    expect(body.db).toBe(true)
    expect(body.billingLagSeconds).toBeGreaterThanOrEqual(1200)
  })
})
