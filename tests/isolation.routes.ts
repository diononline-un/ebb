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
]

/** Parameterised paths that carry no user data of their own. */
export const isolationExempt: RegExp[] = [/^\/api\/auth\//, /^\/api\/billing\/webhook$/]
