import { describe, expect, it } from 'vitest'
import { createApp } from '../src/server/app.ts'

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
