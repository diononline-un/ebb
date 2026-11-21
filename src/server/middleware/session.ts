import { createMiddleware } from 'hono/factory'
import type { AppEnv } from '../app-env.ts'
import { auth } from '../auth.ts'

/** Resolves the Better Auth session cookie into c.var.user (or null). */
export const sessionMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers })
  c.set('user', session ? { id: session.user.id, email: session.user.email, name: session.user.name } : null)
  await next()
})

/** 401 for anonymous requests; after it, c.var.user is set. */
export const requireUser = createMiddleware<AppEnv>(async (c, next) => {
  if (!c.var.user) return c.json({ code: 'unauthenticated' }, 401)
  await next()
})
