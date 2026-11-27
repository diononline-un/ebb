import { Hono } from 'hono'
import type { AppEnv } from './app-env.ts'
import { auth } from './auth.ts'
import { withUser } from './db.ts'
import { deepHealth } from './domain/health/deep.ts'
import { loadAccess } from './domain/users/access.ts'
import { loadMe } from './domain/users/me.ts'
import { env } from './env.ts'
import { dayStartMiddleware } from './middleware/day-start.ts'
import { entitlementMiddleware } from './middleware/entitlement.ts'
import { requestLog } from './middleware/log.ts'
import { requireUser, sessionMiddleware, userOf } from './middleware/session.ts'
import { accountRoutes } from './routes/account.ts'
import { billingRoutes } from './routes/billing.ts'
import { dayRoutes } from './routes/day.ts'
import { devRoutes } from './routes/dev.ts'
import { dumpRoutes } from './routes/dump.ts'
import { eventRoutes } from './routes/events.ts'
import { exportRoutes } from './routes/export.ts'
import { focusRoutes } from './routes/focus.ts'
import { goalRoutes } from './routes/goals.ts'
import { habitRoutes } from './routes/habits.ts'
import { onboardingRoutes } from './routes/onboarding.ts'
import { projectRoutes } from './routes/projects.ts'
import { pushRoutes } from './routes/push.ts'
import { recurrenceRoutes } from './routes/recurrences.ts'
import { resetRoutes } from './routes/reset.ts'
import { spaceRoutes } from './routes/spaces.ts'
import { settingsRoutes } from './routes/settings.ts'
import { taskRoutes } from './routes/tasks.ts'

export function createApp(): Hono<AppEnv> {
  const app = new Hono<AppEnv>()

  // First of all: one JSON line per API response (E9-P8). Health checks are skipped inside.
  app.use('/api/*', requestLog)

  app.get('/api/health', (c) => c.json({ ok: true }))

  // For the uptime monitor: database reachable and the billing queue not stuck (docs/betrieb.md).
  app.get('/api/health/deep', async (c) => {
    const health = await deepHealth()
    return c.json(health, health.ok ? 200 : 503)
  })

  app.on(['GET', 'POST'], '/api/auth/*', (c) => auth.handler(c.req.raw))

  app.use('/api/*', async (c, next) => {
    // Auth routes resolve their own session; everything else gets c.var.user.
    if (c.req.path.startsWith('/api/auth/')) return next()
    return sessionMiddleware(c, next)
  })

  // After the session: the first request of a user's day rolls unfinished work over (E2-P3).
  app.use('/api/*', dayStartMiddleware)

  // After the day start and only on writes: reading and exporting stay open without a subscription.
  app.use('/api/*', async (c, next) => {
    if (!c.var.user) return next()
    return entitlementMiddleware(c, next)
  })

  app.get('/api/me', requireUser, async (c) => {
    const user = userOf(c)
    return c.json(
      await withUser(user.id, async (tx) => ({
        ...(await loadMe(tx, user)),
        access: await loadAccess(tx, new Date()),
      })),
    )
  })

  app.route('/api/settings', settingsRoutes)
  app.route('/api/account', accountRoutes)
  app.route('/api/billing', billingRoutes)
  app.route('/api/dump', dumpRoutes)
  app.route('/api/events', eventRoutes)
  app.route('/api/export', exportRoutes)
  app.route('/api', taskRoutes)
  app.route('/api/day', dayRoutes)
  app.route('/api/focus', focusRoutes)
  app.route('/api/goals', goalRoutes)
  app.route('/api/habits', habitRoutes)
  app.route('/api/onboarding', onboardingRoutes)
  app.route('/api/projects', projectRoutes)
  app.route('/api/push', pushRoutes)
  app.route('/api/recurrences', recurrenceRoutes)
  app.route('/api/reset', resetRoutes)
  app.route('/api/spaces', spaceRoutes)

  if (env.APP_MODE === 'development') app.route('/api/dev', devRoutes)

  app.notFound((c) => c.json({ code: 'not_found' }, 404))

  return app
}
