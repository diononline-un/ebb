import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { closeDb, withSystem } from '../src/server/db.ts'
import { as, createUser, ownerSql, resetDb } from './harness.ts'

beforeEach(resetDb)
afterAll(async () => {
  await closeDb()
  await ownerSql.end()
})

const DEFAULTS = {
  locale: 'en',
  timezone: 'UTC',
  dayStartMinute: 240,
  morningReminder: null,
  weeklyResetDow: 0,
  weeklyResetTime: '18:00',
  errandsDow: null,
  quietStart: '21:00',
  quietEnd: '07:00',
  mustWarnAt: 4,
  timerDefaultMin: 25,
}

const ALL_FLAGS_ON = { morning: true, habits: true, weeklyReset: true, errands: true, timer: true, trial: true }

async function storedSettings(userId: string) {
  const [row] = await withSystem(
    (tx) => tx`
      select locale, timezone, day_start_minute, morning_reminder, must_warn_at, notify
      from user_settings where user_id = ${userId}`,
  )
  if (!row) throw new Error('missing user_settings row for the test user')
  return row
}

describe('GET /api/settings', () => {
  it('returns the bootstrap defaults in camelCase', async () => {
    const user = await createUser()

    const response = await as(user).get('/api/settings')
    expect(response.status).toBe(200)

    const body = await response.json()
    expect(body).toMatchObject(DEFAULTS)
    expect(body.notify).toEqual(ALL_FLAGS_ON)
    expect(body).not.toHaveProperty('userId')
  })
})

describe('PATCH /api/settings', () => {
  it('stores a valid patch and answers with the full settings', async () => {
    const user = await createUser()

    const response = await as(user).patch('/api/settings', {
      locale: 'de',
      timezone: 'Europe/Berlin',
      dayStartMinute: 300,
      morningReminder: '07:30',
      weeklyResetDow: 6,
      mustWarnAt: 5,
      timerDefaultMin: 50,
    })
    expect(response.status).toBe(200)

    const body = await response.json()
    expect(body).toMatchObject({
      locale: 'de',
      timezone: 'Europe/Berlin',
      dayStartMinute: 300,
      morningReminder: '07:30',
      weeklyResetDow: 6,
      mustWarnAt: 5,
      timerDefaultMin: 50,
    })

    expect(await storedSettings(user.id)).toMatchObject({
      locale: 'de',
      timezone: 'Europe/Berlin',
      dayStartMinute: 300,
      morningReminder: '07:30:00',
      mustWarnAt: 5,
    })
  })

  it('merges notify flags instead of replacing the object', async () => {
    const user = await createUser()

    const response = await as(user).patch('/api/settings', { notify: { habits: false } })
    expect(response.status).toBe(200)

    const body = await response.json()
    expect(body.notify).toEqual({ ...ALL_FLAGS_ON, habits: false })
    expect((await storedSettings(user.id)).notify).toEqual({ ...ALL_FLAGS_ON, habits: false })
  })

  it('clears nullable fields with null', async () => {
    const user = await createUser()
    await as(user).patch('/api/settings', { morningReminder: '06:15', errandsDow: 5 })

    const response = await as(user).patch('/api/settings', { morningReminder: null, errandsDow: null })
    expect(response.status).toBe(200)

    const body = await response.json()
    expect(body.morningReminder).toBeNull()
    expect(body.errandsDow).toBeNull()
    expect(await storedSettings(user.id)).toMatchObject({ morningReminder: null })
  })

  it('rejects an unknown time zone with the field name', async () => {
    const user = await createUser()

    const response = await as(user).patch('/api/settings', { timezone: 'Europe/Atlantis' })
    expect(response.status).toBe(400)

    const body = await response.json()
    expect(body.code).toBe('invalid_body')
    expect(Object.keys(body.fields)).toEqual(['timezone'])
    expect(await storedSettings(user.id)).toMatchObject({ timezone: 'UTC' })
  })

  it('rejects dayStartMinute above 720', async () => {
    const user = await createUser()

    const response = await as(user).patch('/api/settings', { dayStartMinute: 721 })
    expect(response.status).toBe(400)

    const body = await response.json()
    expect(Object.keys(body.fields)).toEqual(['dayStartMinute'])
  })

  it('rejects a malformed time of day', async () => {
    const user = await createUser()

    const response = await as(user).patch('/api/settings', { quietStart: '25:00' })
    expect(response.status).toBe(400)
    expect(Object.keys((await response.json()).fields)).toEqual(['quietStart'])
  })

  it('ignores fields outside the schema', async () => {
    const user = await createUser()

    const response = await as(user).patch('/api/settings', { locale: 'fr', theme: 'dark', onioningStep: 3 })
    expect(response.status).toBe(200)

    const body = await response.json()
    expect(body.locale).toBe('fr')
    expect(body).not.toHaveProperty('theme')
    expect(await storedSettings(user.id)).toMatchObject({ locale: 'fr' })
  })

  it('keeps onboarding state and last_day_started untouched', async () => {
    const user = await createUser()
    const before = await withSystem(
      (tx) => tx`select onboarding_step, last_day_started from user_settings where user_id = ${user.id}`,
    )

    const response = await as(user).patch('/api/settings', {
      onboardingStep: 7,
      lastDayStarted: '2020-01-01',
      locale: 'ja',
    })
    expect(response.status).toBe(200)

    const after = await withSystem(
      (tx) => tx`select onboarding_step, last_day_started from user_settings where user_id = ${user.id}`,
    )
    expect(after).toEqual(before)
  })

  it('never touches another user settings', async () => {
    const anna = await createUser('anna@example.test')
    const ben = await createUser('ben@example.test')

    expect((await as(anna).patch('/api/settings', { locale: 'de' })).status).toBe(200)
    expect((await as(ben).patch('/api/settings', { locale: 'ja' })).status).toBe(200)

    expect(await storedSettings(anna.id)).toMatchObject({ locale: 'de' })
    expect(await storedSettings(ben.id)).toMatchObject({ locale: 'ja' })

    const annaView = await (await as(anna).get('/api/settings')).json()
    expect(annaView.locale).toBe('de')
  })

  it('answers 401 without a session', async () => {
    const response = await as({ id: 'nobody', email: 'nobody@example.test', cookie: '' }).get('/api/settings')
    expect(response.status).toBe(401)
  })
})
