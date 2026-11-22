import type { Tx } from '../../db.ts'

// The onboarding carries its progress in user_settings (E4): the step it stands on and the moment it
// was finished. No extra table, no extra state on the client.

export async function saveOnboardingStep(tx: Tx, step: number): Promise<{ step: number }> {
  const [row] = await tx<{ onboardingStep: number }[]>`
    update user_settings set onboarding_step = ${step}, updated_at = now()
     where user_id = app.uid() returning onboarding_step`
  if (!row) throw new Error('missing user_settings row')
  return { step: row.onboardingStep }
}

/**
 * The first finish wins, so a retried or doubled call cannot move the moment. Steps 4–7 of the
 * onboarding were the dump, the sorting and the anchor, so the day counts as ritual done and Today
 * does not send the person into the ritual right after finishing.
 */
export async function finishOnboarding(tx: Tx, today: string): Promise<{ onboardingDoneAt: Date }> {
  const [row] = await tx<{ onboardingDoneAt: Date }[]>`
    update user_settings
       set onboarding_step = 9, onboarding_done_at = coalesce(onboarding_done_at, now()), updated_at = now()
     where user_id = app.uid()
     returning onboarding_done_at`
  if (!row?.onboardingDoneAt) throw new Error('missing user_settings row')
  await tx`
    insert into day_entry (date, ritual_done_at) values (${today}, now())
    on conflict (user_id, date) do update set ritual_done_at = coalesce(day_entry.ritual_done_at, excluded.ritual_done_at)`
  return { onboardingDoneAt: row.onboardingDoneAt }
}
