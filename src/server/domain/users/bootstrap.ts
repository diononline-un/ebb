import { withSystem } from '../../db.ts'
import { env } from '../../env.ts'

/**
 * Creates everything a new account needs: the personal space with its owner membership, settings
 * and access (7-day trial, none in selfhost). Idempotent, safe to call twice.
 */
export async function bootstrapUser(userId: string): Promise<void> {
  // System role: the account has no session yet, and the owner membership is a row the request
  // role may never insert for itself.
  await withSystem(async (tx) => {
    await tx`
      insert into space (kind, owner_id) values ('personal', ${userId})
      on conflict (owner_id) where kind = 'personal' do nothing`
    const [space] = await tx<{ id: string }[]>`
      select id from space where owner_id = ${userId} and kind = 'personal'`
    if (!space) throw new Error('personal space missing after insert')
    await tx`
      insert into space_member (space_id, user_id, role) values (${space.id}, ${userId}, 'owner')
      on conflict do nothing`
    await tx`insert into user_settings (user_id) values (${userId}) on conflict do nothing`
    const trialEnds = env.APP_MODE === 'selfhost' ? null : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    await tx`
      insert into user_access (user_id, trial_ends_at) values (${userId}, ${trialEnds})
      on conflict do nothing`
  })
}
