import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { closeDb } from '../src/server/db.ts'
import type { ExportPayload } from '../src/server/domain/export/export.ts'
import { as, createUser, ownerSql, resetDb, type TestUser } from './harness.ts'

beforeEach(resetDb)
afterAll(async () => {
  await closeDb()
  await ownerSql.end()
})

async function exportOf(user: TestUser): Promise<ExportPayload> {
  const res = await as(user).get('/api/export')
  expect(res.status).toBe(200)
  return (await res.json()) as ExportPayload
}

describe('GET /api/export', () => {
  it('brings everything the person owns and nothing of anyone else', async () => {
    const a = await createUser()
    const b = await createUser()

    await as(a).post('/api/tasks', { title: 'my task' })
    await as(a).post('/api/dump', { clientId: crypto.randomUUID(), text: 'my thought' })
    await as(a).post('/api/goals', { title: 'my goal' })
    await as(a).post('/api/habits', { name: 'my habit' })
    await as(a).post('/api/projects', { name: 'my project' })
    await as(a).post('/api/recurrences', { title: 'my rule', rule: { freq: 'daily' }, startsOn: '2026-11-22' })

    await as(b).post('/api/tasks', { title: 'their task' })
    await as(b).post('/api/goals', { title: 'their goal' })

    const payload = await exportOf(a)
    expect(payload.user.id).toBe(a.id)
    expect(payload.settings).not.toBeNull()
    expect(payload.tasks.map((task) => task['title'])).toEqual(['my task'])
    expect(payload.dumpLines.map((line) => line['text'])).toEqual(['my thought'])
    expect(payload.goals.map((goal) => goal['title'])).toEqual(['my goal'])
    expect(payload.habits.map((habit) => habit['name'])).toEqual(['my habit'])
    expect(payload.projects.map((project) => project['name'])).toEqual(['my project'])
    expect(payload.recurrences.map((rule) => rule['title'])).toEqual(['my rule'])
    expect(payload.spaces).toHaveLength(1)

    const text = JSON.stringify(payload)
    expect(text).not.toContain('their task')
    expect(text).not.toContain('their goal')
  })

  it('offers the file as a download', async () => {
    const user = await createUser()
    const res = await as(user).get('/api/export')
    expect(res.headers.get('content-disposition')).toMatch(/attachment; filename="ebb-export-\d{4}-\d{2}-\d{2}\.json"/)
  })

  it('brings empty lists for an untouched account', async () => {
    const user = await createUser()
    const payload = await exportOf(user)
    expect(payload.tasks).toEqual([])
    expect(payload.weeklyResets).toEqual([])
  })
})
