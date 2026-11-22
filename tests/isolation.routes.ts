import { withSystem } from '../src/server/db.ts'
import { as, type TestUser } from './harness.ts'

export type IsolationRoute = {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  /** Hono path exactly as registered, e.g. '/api/tasks/:id'. Every ':param' gets the seeded id. */
  path: string
  /** Creates a resource as `owner` and returns the id that goes into the path. */
  seed: (owner: TestUser) => Promise<string>
  body?: unknown
}

async function seedDumpLine(owner: TestUser): Promise<string> {
  const response = await as(owner).post('/api/dump', { clientId: crypto.randomUUID(), text: 'isolation seed' })
  const line = (await response.json()) as { id: string }
  return line.id
}

async function seedTask(owner: TestUser): Promise<string> {
  const response = await as(owner).post('/api/tasks', { title: 'isolation seed' })
  const result = (await response.json()) as { task: { id: string } }
  return result.task.id
}

async function seedFocus(owner: TestUser): Promise<string> {
  const response = await as(owner).post('/api/focus', { plannedMinutes: 25 })
  return ((await response.json()) as { id: string }).id
}

async function seedGoal(owner: TestUser): Promise<string> {
  const response = await as(owner).post('/api/goals', { title: 'isolation seed' })
  return ((await response.json()) as { id: string }).id
}

async function seedSpace(owner: TestUser): Promise<string> {
  const response = await as(owner).post('/api/spaces', { name: 'isolation seed' })
  return ((await response.json()) as { id: string }).id
}

async function seedInvite(owner: TestUser): Promise<string> {
  const space = (await (await as(owner).post('/api/spaces', { name: 'isolation seed' })).json()) as { id: string }
  const invite = await as(owner).post(`/api/spaces/${space.id}/invites`, {})
  return ((await invite.json()) as { id: string }).id
}

async function seedStuck(owner: TestUser): Promise<string> {
  // A task that slid three times is a Dauerschieber and thus reachable through /api/reset/stuck/:id.
  const response = await as(owner).post('/api/tasks', { title: 'isolation seed' })
  const id = ((await response.json()) as { task: { id: string } }).task.id
  // FORCE RLS binds the owner too, so the system role makes the seed: it would not update otherwise.
  await withSystem((tx) => tx`update task set push_count = 3 where id = ${id}`)
  return id
}

async function seedProject(owner: TestUser): Promise<string> {
  const response = await as(owner).post('/api/projects', { name: 'isolation seed' })
  return ((await response.json()) as { project: { id: string } }).project.id
}

async function seedRecurrence(owner: TestUser): Promise<string> {
  const response = await as(owner).post('/api/recurrences', {
    title: 'isolation seed',
    rule: { freq: 'daily' },
    startsOn: '2026-11-22',
  })
  return ((await response.json()) as { id: string }).id
}

async function seedHabit(owner: TestUser): Promise<string> {
  const response = await as(owner).post('/api/habits', { name: 'isolation seed' })
  return ((await response.json()) as { id: string }).id
}

/**
 * Every route with a path parameter. A second user must get 404 for the owner's id (never 403,
 * never data). tests/isolation.test.ts fails when a parameterised route is missing here.
 * Each API package appends its own entries.
 */
export const isolationRoutes: IsolationRoute[] = [
  { method: 'POST', path: '/api/dump/:id/to-task', seed: seedDumpLine },
  { method: 'POST', path: '/api/dump/:id/archive', seed: seedDumpLine },
  { method: 'GET', path: '/api/tasks/:id', seed: seedTask },
  { method: 'PATCH', path: '/api/tasks/:id', seed: seedTask, body: { title: 'stolen' } },
  { method: 'DELETE', path: '/api/tasks/:id', seed: seedTask },
  { method: 'POST', path: '/api/tasks/:id/triage', seed: seedTask, body: { kind: 'errand' } },
  { method: 'POST', path: '/api/tasks/:id/claim', seed: seedTask },
  { method: 'POST', path: '/api/focus/:id/stop', seed: seedFocus },
  { method: 'PATCH', path: '/api/goals/:id', seed: seedGoal, body: { title: 'stolen' } },
  { method: 'DELETE', path: '/api/goals/:id', seed: seedGoal },
  { method: 'PATCH', path: '/api/habits/:id', seed: seedHabit, body: { name: 'stolen' } },
  // Both segments get the habit id; a day that reads like no day names nothing either.
  { method: 'PUT', path: '/api/habits/:id/log/:date', seed: seedHabit },
  { method: 'DELETE', path: '/api/habits/:id/log/:date', seed: seedHabit },
  { method: 'GET', path: '/api/projects/:id', seed: seedProject },
  { method: 'PATCH', path: '/api/projects/:id', seed: seedProject, body: { name: 'stolen' } },
  { method: 'DELETE', path: '/api/projects/:id', seed: seedProject },
  { method: 'PATCH', path: '/api/recurrences/:id', seed: seedRecurrence, body: { title: 'stolen' } },
  { method: 'DELETE', path: '/api/recurrences/:id', seed: seedRecurrence },
  { method: 'POST', path: '/api/reset/stuck/:id', seed: seedStuck, body: { decision: 'skip' } },
  { method: 'POST', path: '/api/spaces/:id/invites', seed: seedSpace, body: {} },
  { method: 'POST', path: '/api/spaces/:id/leave', seed: seedSpace },
  { method: 'GET', path: '/api/spaces/:id/members', seed: seedSpace },
  { method: 'GET', path: '/api/spaces/:id/tasks', seed: seedSpace },
  { method: 'PATCH', path: '/api/spaces/:id', seed: seedSpace, body: { name: 'stolen' } },
  { method: 'DELETE', path: '/api/spaces/:id', seed: seedSpace, body: { name: 'isolation seed' } },
  { method: 'DELETE', path: '/api/spaces/:id/members/:userId', seed: seedSpace },
  { method: 'DELETE', path: '/api/spaces/invites/:inviteId', seed: seedInvite },
]

/** Parameterised paths that carry no user data of their own. */
export const isolationExempt: RegExp[] = [/^\/api\/auth\//, /^\/api\/billing\/webhook$/]
