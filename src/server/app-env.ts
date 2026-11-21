import type { Context } from 'hono'

export type SessionUser = { id: string; email: string; name: string }

/** Hono context variables shared by every route. */
export type AppEnv = {
  Variables: {
    user: SessionUser | null
  }
}

export type AppContext = Context<AppEnv>
