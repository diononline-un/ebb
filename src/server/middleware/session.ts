import { createMiddleware } from 'hono/factory'
import type { AppContext, AppEnv, SessionUser } from '../app-env.ts'
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

/** The signed-in user in a handler behind requireUser. Throws if the middleware was forgotten. */
export function userOf(c: AppContext): SessionUser {
  const user = c.var.user
  if (!user) throw new Error('userOf() used on a route without requireUser')
  return user
}
