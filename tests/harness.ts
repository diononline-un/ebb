import postgres from 'postgres'
import { createApp } from '../src/server/app.ts'
import { dbUrl, env } from '../src/server/env.ts'

// Owner connection for test setup only (truncate, inspect roles). Never import this from src/.
// FORCE RLS binds the owner too: inspect app data with withSystem() from src/server/db.ts instead.
export const ownerSql = postgres(dbUrl('owner'), { max: 2, onnotice: () => {}, transform: postgres.camel })

/** Empties every app table. Refuses to run against anything but a test database. */
export async function resetDb(): Promise<void> {
  if (!env.EBB_DB_NAME.startsWith('ebb_test')) {
    throw new Error(`resetDb refuses to truncate "${env.EBB_DB_NAME}"`)
  }
  const tables = await ownerSql<{ tablename: string }[]>`
    select tablename from pg_tables where schemaname = 'public' and tablename <> 'schema_migrations'`
  if (tables.length === 0) return
  const list = tables.map((table) => `public."${table.tablename}"`).join(', ')
  await ownerSql.unsafe(`truncate ${list} restart identity cascade`)
}

export type TestUser = { id: string; email: string; cookie: string }

export const TEST_PASSWORD = 'test password long enough'
const app = createApp()
let sequence = 0

/** Registers a real account through Better Auth and signs it in. Skips only the mail step. */
export async function createUser(email?: string): Promise<TestUser> {
  sequence += 1
  const address = email ?? `user${sequence}-${Date.now()}@example.test`
  // A fresh IP per user keeps the sign-up rate limit (5/min/IP) out of the way.
  const headers = {
    'content-type': 'application/json',
    origin: env.APP_URL,
    'x-forwarded-for': `10.1.${Math.floor(sequence / 250)}.${(sequence % 250) + 1}`,
  }
  const signUp = await app.request('/api/auth/sign-up/email', {
    method: 'POST',
    headers,
    body: JSON.stringify({ email: address, password: TEST_PASSWORD, name: address.split('@')[0] }),
  })
  if (signUp.status !== 200) throw new Error(`sign-up failed: ${signUp.status} ${await signUp.text()}`)
  // Verification by mail is covered in tests/auth.test.ts.
  await ownerSql`update "user" set "emailVerified" = true where email = ${address}`
  const signIn = await app.request('/api/auth/sign-in/email', {
    method: 'POST',
    headers,
    body: JSON.stringify({ email: address, password: TEST_PASSWORD }),
  })
  if (signIn.status !== 200) throw new Error(`sign-in failed: ${signIn.status} ${await signIn.text()}`)
  const cookie = signIn.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ')
  const { user } = (await signIn.json()) as { user: { id: string } }
  return { id: user.id, email: address, cookie }
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

/** Requests against createApp() as the given user. */
export function as(user: TestUser) {
  const call = (method: Method, path: string, body?: unknown) =>
    app.request(path, {
      method,
      headers: {
        cookie: user.cookie,
        origin: env.APP_URL,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
  return {
    request: call,
    get: (path: string) => call('GET', path),
    post: (path: string, body?: unknown) => call('POST', path, body),
    put: (path: string, body?: unknown) => call('PUT', path, body),
    patch: (path: string, body?: unknown) => call('PATCH', path, body),
    delete: (path: string) => call('DELETE', path),
  }
}
