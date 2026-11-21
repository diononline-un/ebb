import { Hono } from 'hono'
import type { AppEnv } from './app-env.ts'
import { auth } from './auth.ts'
import { env } from './env.ts'
import { requireUser, sessionMiddleware } from './middleware/session.ts'
import { devRoutes } from './routes/dev.ts'

export function createApp(): Hono<AppEnv> {
  const app = new Hono<AppEnv>()

  app.get('/api/health', (c) => c.json({ ok: true }))

  app.on(['GET', 'POST'], '/api/auth/*', (c) => auth.handler(c.req.raw))

  app.use('/api/*', async (c, next) => {
    // Auth routes resolve their own session; everything else gets c.var.user.
    if (c.req.path.startsWith('/api/auth/')) return next()
    return sessionMiddleware(c, next)
  })

  app.get('/api/me', requireUser, (c) => c.json(c.var.user))

  if (env.APP_MODE === 'development') app.route('/api/dev', devRoutes)

  app.notFound((c) => c.json({ code: 'not_found' }, 404))

  return app
}
