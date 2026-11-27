import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { closeDb, withSystem } from '../src/server/db.ts'
import { runReminders } from '../src/server/jobs/reminders.ts'
import type { PushPayload, PushResult, PushTarget } from '../src/server/push/send.ts'
import { as, createUser, ownerSql, resetDb, type TestUser } from './harness.ts'

// E9-P2: the reminder job end to end against the test database. A fixed `now` and a fake send keep
// the clock and the push service out of it.

beforeEach(resetDb)
afterAll(async () => {
  await closeDb()
  await ownerSql.end()
})

/** Monday 2026-06-01, 07:30 in Berlin (CEST). */
const MONDAY_0730 = new Date('2026-06-01T05:30:00Z')

async function subscribe(user: TestUser): Promise<void> {
  const response = await as(user).post('/api/push/subscriptions', {
    endpoint: `https://fcm.googleapis.com/e9-p2-${user.id}`,
    keys: { p256dh: 'BNcKp1zP-encryption-key', auth: 'auth-secret' },
  })
  expect(response.status).toBe(204)
}

async function update(user: TestUser, patch: Record<string, unknown>): Promise<void> {
  const response = await as(user).patch('/api/settings', patch)
  expect(response.status).toBe(200)
}

type Sent = { target: PushTarget; payload: PushPayload }

function collector(result: PushResult = 'ok') {
  const pushes: Sent[] = []
  const send = async (target: PushTarget, payload: PushPayload): Promise<PushResult> => {
    pushes.push({ target, payload })
    return result
  }
  return { pushes, send }
}

async function subscriptionsOf(user: TestUser): Promise<Array<{ endpoint: string }>> {
  return withSystem(
    (tx) => tx`select endpoint from push_subscription where user_id = ${user.id} order by endpoint`,
  )
}

describe('runReminders morning', () => {
  it('sends the morning reminder once, not again in the same minute or ten minutes later', async () => {
    const user = await createUser()
    await subscribe(user)
    await update(user, { timezone: 'Europe/Berlin', morningReminder: '07:30' })
    const { pushes, send } = collector()

    expect(await runReminders(MONDAY_0730, send)).toEqual({ sent: 1, skipped: 0 })
    expect(pushes.map((push) => push.payload)).toEqual([
      { title: "Your morning, when you're ready", body: 'A few quiet minutes to choose the day.', url: '/ritual' },
    ])

    expect(await runReminders(MONDAY_0730, send)).toEqual({ sent: 0, skipped: 1 })
    expect(await runReminders(new Date(MONDAY_0730.getTime() + 10 * 60 * 1000), send)).toEqual({
      sent: 0,
      skipped: 1,
    })
    expect(pushes).toHaveLength(1)
  })

  it('sends nothing when the ritual of the app day is done', async () => {
    const user = await createUser()
    await subscribe(user)
    await update(user, { timezone: 'Europe/Berlin', morningReminder: '07:30' })
    await withSystem(
      (tx) => tx`insert into day_entry (user_id, date, ritual_done_at)
                 values (${user.id}, ${'2026-06-01'}::date, now())`,
    )
    const { pushes, send } = collector()

    expect(await runReminders(MONDAY_0730, send)).toEqual({ sent: 0, skipped: 0 })
    expect(pushes).toEqual([])
  })
})

describe('runReminders habit', () => {
  it('sends nothing when the habit lists another weekday', async () => {
    const user = await createUser()
    await subscribe(user)
    await update(user, { timezone: 'Europe/Berlin' })
    // Wednesday; the job runs on a Monday.
    await withSystem(
      (tx) => tx`insert into habit (user_id, name, reminder_time, weekdays)
                 values (${user.id}, 'Stretch', ${'07:30'}::time, ${[3]}::int[])`,
    )
    const { pushes, send } = collector()

    expect(await runReminders(MONDAY_0730, send)).toEqual({ sent: 0, skipped: 0 })
    expect(pushes).toEqual([])
  })
})

describe('runReminders timer', () => {
  it('sends the finished session at 23:00, inside quiet hours', async () => {
    const user = await createUser()
    await subscribe(user)
    await update(user, { timezone: 'Europe/Berlin' })
    const night = new Date('2026-06-01T21:00:00Z')
    await withSystem(
      (tx) => tx`insert into focus_session (user_id, started_at, planned_minutes)
                 values (${user.id}, ${new Date(night.getTime() - 30 * 60 * 1000)}, 25)`,
    )
    const { pushes, send } = collector()

    expect(await runReminders(night, send)).toEqual({ sent: 1, skipped: 0 })
    expect(pushes.map((push) => push.payload.url)).toEqual(['/today'])
  })
})

describe('runReminders subscribers', () => {
  it('never loads a person without a push subscription', async () => {
    const user = await createUser()
    await update(user, { timezone: 'Europe/Berlin', morningReminder: '07:30' })
    const { pushes, send } = collector()

    expect(await runReminders(MONDAY_0730, send)).toEqual({ sent: 0, skipped: 0 })
    expect(pushes).toEqual([])
    const [count] = await withSystem((tx) => tx<{ count: number }[]>`select count(*)::int as count from reminder_sent`)
    expect(count?.count).toBe(0)
  })

  it('removes the subscription a gone push service reports', async () => {
    const user = await createUser()
    await subscribe(user)
    await update(user, { timezone: 'Europe/Berlin', morningReminder: '07:30' })
    const { send } = collector('gone')

    expect(await runReminders(MONDAY_0730, send)).toEqual({ sent: 1, skipped: 0 })
    expect(await subscriptionsOf(user)).toEqual([])
  })

  it('falls back to English for a language whose translation is not reviewed', async () => {
    const user = await createUser()
    await subscribe(user)
    await update(user, { timezone: 'Europe/Berlin', morningReminder: '07:30', locale: 'de' })
    const { pushes, send } = collector()

    expect(await runReminders(MONDAY_0730, send)).toEqual({ sent: 1, skipped: 0 })
    expect(pushes[0]?.payload.title).toBe("Your morning, when you're ready")
  })
})
