import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { createApp } from './app.ts'
import { env } from './env.ts'

const port = env.PORT
const app = createApp()

if (env.NODE_ENV === 'production') {
  const serveIndex = serveStatic({ path: './dist/web/index.html' })
  app.use('*', serveStatic({ root: './dist/web' }))
  // Unknown API paths must stay JSON 404s; only app routes fall back to the SPA shell.
  app.get('*', (c, next) => (c.req.path.startsWith('/api/') ? next() : serveIndex(c, next)))
}

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`ebb listening on http://127.0.0.1:${info.port}`)
})
