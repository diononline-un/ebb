import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { createApp } from './app.ts'

const port = Number(process.env['PORT'] ?? 2040)
const app = createApp()

if (process.env['NODE_ENV'] === 'production') {
  app.use('*', serveStatic({ root: './dist/web' }))
  app.get('*', serveStatic({ path: './dist/web/index.html' }))
}

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`ebb listening on http://127.0.0.1:${info.port}`)
})
