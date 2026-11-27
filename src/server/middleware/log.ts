import { createMiddleware } from 'hono/factory'
import type { AppEnv } from '../app-env.ts'
import { env } from '../env.ts'

// Uptime checks would be most of the log and repeat the same line every minute.
const SKIP = new Set(['/api/health', '/api/health/deep'])

// Development stays quiet unless asked; deployed modes log every request (docs/betrieb.md).
const enabled = env.LOG_REQUESTS ? env.LOG_REQUESTS === '1' : env.APP_MODE !== 'development'

/**
 * One JSON line per API response: time, method, route pattern, status, duration.
 * The route pattern (never the real path) keeps ids, invite tokens and mail addresses out of the log.
 */
export const requestLog = createMiddleware<AppEnv>(async (c, next) => {
  if (!enabled) return next()
  const startedAt = performance.now()
  await next()
  try {
    // After next() the request points at the innermost matched route, for example '/api/tasks/:id'.
    const route = c.req.routePath
    if (SKIP.has(route)) return
    console.log(
      JSON.stringify({
        t: new Date().toISOString(),
        method: c.req.method,
        route,
        status: c.res.status,
        ms: Math.round(performance.now() - startedAt),
      }),
    )
  } catch {
    // Logging must never break a response.
  }
})
