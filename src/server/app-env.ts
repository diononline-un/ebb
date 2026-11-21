import type { Context } from 'hono'

export type SessionUser = { id: string; email: string; name: string }

/** Hono context variables shared by every route. */
export type AppEnv = {
  Variables: {
    user: SessionUser | null
    /** The user's calendar day, set by middleware/day-start.ts for signed-in API requests. */
    today: string | undefined
  }
}

export type AppContext = Context<AppEnv>
