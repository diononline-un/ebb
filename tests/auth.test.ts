import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

// Counts calls but runs the real bootstrap, so signed-in users have settings like in production.
const bootstrap = vi.hoisted(() => vi.fn<(userId: string) => Promise<void>>())
vi.mock('../src/server/domain/users/bootstrap.ts', async (importActual) => {
  const actual = await importActual<typeof import('../src/server/domain/users/bootstrap.ts')>()
  bootstrap.mockImplementation(actual.bootstrapUser)
  return { bootstrapUser: bootstrap }
})

const { createApp } = await import('../src/server/app.ts')
const { appRoleSqlForTests, closeDb, withSystem } = await import('../src/server/db.ts')
const { clearDevMails, devMails } = await import('../src/server/mail.ts')
const { env } = await import('../src/server/env.ts')
const { ownerSql, resetDb } = await import('./harness.ts')

const app = createApp()
const PASSWORD = 'correct horse battery'
let ipCounter = 0

function nextIp(): string {
  ipCounter += 1
  return `10.0.0.${ipCounter}`
}

function post(path: string, body: unknown, ip: string, cookie?: string) {
  return app.request(path, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: env.APP_URL,
      'x-forwarded-for': ip,
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
  })
}

function cookieOf(res: Response): string {
  return res.headers
    .getSetCookie()
    .map((cookie) => cookie.split(';')[0])
    .join('; ')
}

async function signUpAndVerify(email: string, ip: string): Promise<string> {
  const signUp = await post('/api/auth/sign-up/email', { email, password: PASSWORD, name: 'Mara' }, ip)
  expect(signUp.status).toBe(200)
  const mail = devMails().find((m) => m.to === email)
  expect(mail?.subject).toBe('Confirm your email for Ebb')
  const link = new URL(/https?:\/\/\S+/.exec(mail?.text ?? '')?.[0] ?? '')
  const verify = await app.request(link.pathname + link.search, { headers: { 'x-forwarded-for': ip } })
  expect([200, 302]).toContain(verify.status)
  return cookieOf(verify)
}

beforeEach(async () => {
  await resetDb()
  clearDevMails()
  bootstrap.mockClear()
})

afterAll(async () => {
  await closeDb()
  await ownerSql.end()
})

describe('sign-up, verification, sign-in', () => {
  it('signs up, verifies by mail and reaches /api/me', async () => {
    const ip = nextIp()
    await signUpAndVerify('mara@example.test', ip)

    const signIn = await post('/api/auth/sign-in/email', { email: 'mara@example.test', password: PASSWORD }, ip)
    expect(signIn.status).toBe(200)

    const me = await app.request('/api/me', { headers: { cookie: cookieOf(signIn) } })
    expect(me.status).toBe(200)
    const body = (await me.json()) as { user: { id: string; email: string } }
    expect(body.user.email).toBe('mara@example.test')
    expect(body.user.id).toMatch(/\S+/)
  })

  it('calls bootstrapUser exactly once with the new user id', async () => {
    await signUpAndVerify('jonas@example.test', nextIp())
    expect(bootstrap).toHaveBeenCalledTimes(1)
    const [row] = await withSystem((tx) => tx`select id from "user" where email = 'jonas@example.test'`)
    expect(bootstrap).toHaveBeenCalledWith(row?.['id'])
  })

  it('refuses sign-in before the email is verified', async () => {
    const ip = nextIp()
    await post('/api/auth/sign-up/email', { email: 'new@example.test', password: PASSWORD, name: 'New' }, ip)
    const signIn = await post('/api/auth/sign-in/email', { email: 'new@example.test', password: PASSWORD }, ip)
    expect(signIn.status).toBe(403)
  })

  it('answers 401 for a wrong password', async () => {
    const ip = nextIp()
    await signUpAndVerify('wrong@example.test', ip)
    const signIn = await post('/api/auth/sign-in/email', { email: 'wrong@example.test', password: 'not the password' }, ip)
    expect(signIn.status).toBe(401)
  })

  it('rejects passwords shorter than 10 characters', async () => {
    const res = await post('/api/auth/sign-up/email', { email: 'short@example.test', password: 'short', name: 'S' }, nextIp())
    expect(res.status).toBe(400)
  })

  it('rate-limits the 11th sign-in attempt within a minute', async () => {
    const ip = nextIp()
    const statuses: number[] = []
    for (let i = 0; i < 11; i += 1) {
      const res = await post('/api/auth/sign-in/email', { email: 'nobody@example.test', password: 'whatever-wrong' }, ip)
      statuses.push(res.status)
    }
    expect(statuses.slice(0, 10).every((s) => s === 401)).toBe(true)
    expect(statuses[10]).toBe(429)
  })

  it('answers 401 on /api/me without a session', async () => {
    const res = await app.request('/api/me')
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ code: 'unauthenticated' })
  })
})

describe('auth tables are private to ebb_auth', () => {
  it.each(['user', 'session', 'account', 'passkey', 'verification'])('ebb_app cannot read "%s"', async (table) => {
    await expect(appRoleSqlForTests().unsafe(`select * from "${table}" limit 1`)).rejects.toThrow(/permission denied/)
  })

  it('ebb_system may read id, email and name of users but no password hashes', async () => {
    await expect(withSystem((tx) => tx`select id, email, name from "user" limit 1`)).resolves.toBeDefined()
    await expect(withSystem((tx) => tx`select "password" from "account" limit 1`)).rejects.toThrow(/permission denied/)
    await expect(withSystem((tx) => tx`select "emailVerified" from "user" limit 1`)).rejects.toThrow(/permission denied/)
  })
})
