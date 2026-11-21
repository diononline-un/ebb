import type { SessionUser } from '../../app-env.ts'
import type { Tx } from '../../db.ts'
import { getSettings, type Settings } from '../settings/settings.ts'

export type Me = {
  user: SessionUser
  settings: Settings
  personalSpaceId: string | null
  trialEndsAt: Date | null
}

/** Everything the client needs right after sign-in. Runs inside withUser. */
export async function loadMe(tx: Tx, user: SessionUser): Promise<Me> {
  // Same shape as GET /api/settings (times as HH:MM), so the client has one Settings type.
  const settings = await getSettings(tx)
  const [space] = await tx<{ id: string }[]>`
    select id from space where owner_id = app.uid() and kind = 'personal'`
  const [access] = await tx<{ trialEndsAt: Date | null }[]>`
    select trial_ends_at from user_access where user_id = app.uid()`
  return {
    user,
    settings,
    personalSpaceId: space?.id ?? null,
    trialEndsAt: access?.trialEndsAt ?? null,
  }
}
