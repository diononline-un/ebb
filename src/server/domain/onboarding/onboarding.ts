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

/** The first finish wins, so a retried or doubled call cannot move the moment. */
export async function finishOnboarding(tx: Tx): Promise<{ onboardingDoneAt: Date }> {
  const [row] = await tx<{ onboardingDoneAt: Date }[]>`
    update user_settings
       set onboarding_step = 9, onboarding_done_at = coalesce(onboarding_done_at, now()), updated_at = now()
     where user_id = app.uid()
     returning onboarding_done_at`
  if (!row?.onboardingDoneAt) throw new Error('missing user_settings row')
  return { onboardingDoneAt: row.onboardingDoneAt }
}
