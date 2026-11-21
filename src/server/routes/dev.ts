import { Hono } from 'hono'
import type { AppEnv } from '../app-env.ts'
import { devMails } from '../mail.ts'

/** Development-only helpers. createApp() registers them only when APP_MODE=development. */
export const devRoutes = new Hono<AppEnv>().get('/mails', (c) => c.json(devMails()))
