import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { closeDb, withSystem } from '../src/server/db.ts'
import { runTrialMails } from '../src/server/jobs/trial-mails.ts'
import { clearDevMails, devMails } from '../src/server/mail.ts'
import { APP_NAME } from '../src/shared/brand.ts'
import { as, createUser, ownerSql, resetDb, type TestUser } from './harness.ts'

beforeEach(async () => {
  await resetDb()
  clearDevMails()
})
afterAll(async () => {
  await closeDb()
  await ownerSql.end()
})

const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/** A fresh account whose trial ends at `now + ms`. Dev mails start empty, so only the job shows up. */
async function accountWithTrial(ms: number): Promise<TestUser> {
  const user = await createUser()
  await withSystem(
    (tx) => tx`update user_access set trial_ends_at = ${new Date(Date.now() + ms)} where user_id = ${user.id}`,
  )
  clearDevMails()
  return user
}

/** An active subscription paid by that person; the seed of a seat subscription for another. */
async function subscribed(payer: TestUser): Promise<string> {
  const [row] = await withSystem((tx) => tx<{ id: string }[]>`
    insert into subscription (payer_user_id, paddle_subscription_id, paddle_customer_id, status, current_period_end)
    values (${payer.id}, ${`sub_${crypto.randomUUID()}`}, 'ctm_test', 'active',
            ${new Date(Date.now() + 30 * DAY)})
    returning id`)
  if (!row) throw new Error('subscription insert failed')
  return row.id
}

function mailsFor(user: TestUser) {
  return devMails().filter((mail) => mail.to === user.email)
}

describe('runTrialMails', () => {
  it('sends the 2-day mail once when the trial ends in 36 hours', async () => {
    const user = await accountWithTrial(36 * HOUR)
    const now = new Date()

    expect(await runTrialMails(now)).toEqual({ soon: 1, ended: 0 })
    const mails = mailsFor(user)
    expect(mails).toHaveLength(1)
    expect(mails[0]?.subject).toBe(`Your ${APP_NAME} trial ends in 2 days`)
    expect(mails[0]?.text).toContain('Your week so far')

    // The mark in user_access keeps the hourly run from sending it again.
    expect(await runTrialMails(now)).toEqual({ soon: 0, ended: 0 })
    expect(mailsFor(user)).toHaveLength(1)
  })

  it('stays quiet when the trial ends in 5 days', async () => {
    const user = await accountWithTrial(5 * DAY)

    expect(await runTrialMails(new Date())).toEqual({ soon: 0, ended: 0 })
    expect(mailsFor(user)).toEqual([])
  })

  it('sends the ended mail once when the trial ended an hour ago', async () => {
    const user = await accountWithTrial(-1 * HOUR)
    const now = new Date()

    expect(await runTrialMails(now)).toEqual({ soon: 0, ended: 1 })
    const mails = mailsFor(user)
    expect(mails).toHaveLength(1)
    expect(mails[0]?.subject).toBe(`Your ${APP_NAME} trial has ended`)

    expect(await runTrialMails(now)).toEqual({ soon: 0, ended: 0 })
    expect(mailsFor(user)).toHaveLength(1)
  })

  it('leaves accounts alone whose trial ended ten days ago', async () => {
    const user = await accountWithTrial(-10 * DAY)

    expect(await runTrialMails(new Date())).toEqual({ soon: 0, ended: 0 })
    expect(mailsFor(user)).toEqual([])
  })

  it('skips an account with a running subscription and one carried by a seat', async () => {
    const owner = await accountWithTrial(36 * HOUR)
    const subscriptionId = await subscribed(owner)

    const member = await accountWithTrial(-1 * HOUR)
    await withSystem(
      (tx) => tx`insert into subscription_seat (subscription_id, user_id) values (${subscriptionId}, ${member.id})`,
    )

    expect(await runTrialMails(new Date())).toEqual({ soon: 0, ended: 0 })
    expect(mailsFor(owner)).toEqual([])
    expect(mailsFor(member)).toEqual([])
  })

  it('counts the tasks done in the week so far', async () => {
    const user = await accountWithTrial(36 * HOUR)
    const today = ((await (await as(user).get('/api/today')).json()) as { date: string }).date
    const created = await as(user).post('/api/tasks', { title: 'write the letter', doDate: today })
    const task = ((await created.json()) as { task: { id: string } }).task
    expect((await as(user).patch(`/api/tasks/${task.id}`, { status: 'done' })).status).toBe(200)

    expect(await runTrialMails(new Date())).toEqual({ soon: 1, ended: 0 })
    const [mail] = mailsFor(user)
    expect(mail?.text).toContain('1 task done')
    expect(mail?.text).toContain('/settings/billing')
  })
})
