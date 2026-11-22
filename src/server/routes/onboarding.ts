import { Hono } from 'hono'
import { z } from 'zod'
import type { AppEnv } from '../app-env.ts'
import { withUser } from '../db.ts'
import { finishOnboarding, saveOnboardingStep } from '../domain/onboarding/onboarding.ts'
import { todayOf } from '../middleware/day-start.ts'
import { requireUser, userOf } from '../middleware/session.ts'
import { fieldErrors, invalidBody, readJson } from './http.ts'

/** onboarding_step is a small 0–9 counter: which of the nine steps the person stands on (PRD F2). */
const StepBody = z.object({ step: z.number().int().min(0).max(9) })

export const onboardingRoutes = new Hono<AppEnv>()
  .put('/', requireUser, async (c) => {
    const json = await readJson(c)
    if ('response' in json) return json.response
    const parsed = StepBody.safeParse(json.body)
    if (!parsed.success) return invalidBody(c, fieldErrors(parsed.error))

    return c.json(await withUser(userOf(c).id, (tx) => saveOnboardingStep(tx, parsed.data.step)))
  })
  .post('/done', requireUser, async (c) => {
    const done = await withUser(userOf(c).id, (tx) => finishOnboarding(tx, todayOf(c)))
    return c.json({ onboardingDoneAt: done.onboardingDoneAt.toISOString() })
  })
