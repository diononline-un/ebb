import type { SessionUser } from '../../app-env.ts'
import type { Tx } from '../../db.ts'

export type Me = {
  user: SessionUser
  settings: Record<string, unknown> | null
  personalSpaceId: string | null
  trialEndsAt: Date | null
}

/** Everything the client needs right after sign-in. Runs inside withUser. */
export async function loadMe(tx: Tx, user: SessionUser): Promise<Me> {
  const [settings] = await tx`select * from user_settings where user_id = app.uid()`
  const [space] = await tx<{ id: string }[]>`
    select id from space where owner_id = app.uid() and kind = 'personal'`
  const [access] = await tx<{ trialEndsAt: Date | null }[]>`
    select trial_ends_at from user_access where user_id = app.uid()`
  if (settings) {
    delete settings['userId']
  }
  return {
    user,
    settings: settings ?? null,
    personalSpaceId: space?.id ?? null,
    trialEndsAt: access?.trialEndsAt ?? null,
  }
}
