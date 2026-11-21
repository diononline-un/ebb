import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../src/server/app.ts'
import { closeDb } from '../src/server/db.ts'
import { as, createUser, ownerSql, resetDb } from './harness.ts'
import { isolationExempt, isolationRoutes } from './isolation.routes.ts'

beforeEach(resetDb)
afterAll(async () => {
  await closeDb()
  await ownerSql.end()
})

describe('isolation coverage', () => {
  it('lists every parameterised route in tests/isolation.routes.ts', () => {
    const covered = new Set(isolationRoutes.map((route) => `${route.method} ${route.path}`))
    const missing = createApp()
      .routes.filter((route) => route.method !== 'ALL' && /[:*]/.test(route.path))
      .filter((route) => !isolationExempt.some((pattern) => pattern.test(route.path)))
      .map((route) => `${route.method} ${route.path}`)
      .filter((key) => !covered.has(key))
    expect(missing, 'add these routes to tests/isolation.routes.ts').toEqual([])
  })
})

describe('foreign ids answer 404', () => {
  // Vitest rejects an empty suite; the first API package with an :id route replaces this.
  if (isolationRoutes.length === 0) it.skip('no parameterised routes yet', () => {})

  for (const route of isolationRoutes) {
    it(`${route.method} ${route.path}`, async () => {
      const owner = await createUser()
      const id = await route.seed(owner)
      const stranger = await createUser()
      const path = route.path.replace(/:[A-Za-z]+/g, id)

      const res = await as(stranger).request(route.method, path, route.body)

      expect(res.status).toBe(404)
      expect(await res.text()).not.toContain(owner.email)
    })
  }
})
