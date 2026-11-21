import type { TestUser } from './harness.ts'

export type IsolationRoute = {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  /** Hono path exactly as registered, e.g. '/api/tasks/:id'. Every ':param' gets the seeded id. */
  path: string
  /** Creates a resource as `owner` and returns the id that goes into the path. */
  seed: (owner: TestUser) => Promise<string>
  body?: unknown
}

/**
 * Every route with a path parameter. A second user must get 404 for the owner's id (never 403,
 * never data). tests/isolation.test.ts fails when a parameterised route is missing here.
 * Each API package appends its own entries.
 */
export const isolationRoutes: IsolationRoute[] = []

/** Parameterised paths that carry no user data of their own. */
export const isolationExempt: RegExp[] = [/^\/api\/auth\//, /^\/api\/billing\/webhook$/]
