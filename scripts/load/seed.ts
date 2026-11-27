// E9-P6 load test: creates the accounts of the load run and writes 200 session cookies for
// scripts/load/scenario.ts (docs/betrieb.md, "Lasttest"). The mass goes straight into the tables;
// the auth tables take the same road as tests/harness.ts (createUser).
// Run: EBB_DB_NAME=ebb_test_load node scripts/load/seed.ts [--users 5000]
import { writeFile } from 'node:fs/promises'
import postgres from 'postgres'
import { createApp } from '../../src/server/app.ts'
import { closeDb, withUser } from '../../src/server/db.ts'
import { dbUrl, env } from '../../src/server/env.ts'
import { localDate } from '../../src/shared/day.ts'

const SESSIONS_FILE = '/tmp/ebb-load-sessions.json'
/** How many accounts get a session: 200 people are enough to drive 100 req/s. */
const SESSION_USERS = 200
const TASKS_PER_USER = 50
const PASSWORD = 'load test password'
/** Accounts in flight; the sign-up path hashes a password, so more parallelism buys nothing. */
const BATCH = 8

// Owner connection for the verification flag only, exactly as tests/harness.ts does it. Scripts
// may hold it; src/ never does (docs/architektur.md).
const ownerSql = postgres(dbUrl('owner'), { max: BATCH, onnotice: () => {} })
const app = createApp()

function arg(name: string, fallback: string): string {
  const at = process.argv.indexOf(`--${name}`)
  return at === -1 ? fallback : (process.argv[at + 1] ?? fallback)
}

const users = Number(arg('users', '5000'))
if (!Number.isInteger(users) || users < 1) throw new Error('--users needs a positive integer')

// The package forbids the development database; 250 000 tasks would bury it.
if (env.EBB_DB_NAME === 'ebb') throw new Error('refusing to seed the development database "ebb"')

/** A fresh client IP per account keeps Better Auth's sign-up limit (5/min/IP) out of the way. */
function requestHeaders(index: number): Record<string, string> {
  return {
    'content-type': 'application/json',
    origin: env.APP_URL,
    'x-forwarded-for': `10.2.${Math.floor(index / 250)}.${(index % 250) + 1}`,
  }
}

type Account = { index: number; email: string; id: string }

/** Registers a real account through Better Auth; the hook behind it calls bootstrapUser. */
async function createAccount(index: number): Promise<Account> {
  const email = `load${index}@load.test`
  const response = await app.request('/api/auth/sign-up/email', {
    method: 'POST',
    headers: requestHeaders(index),
    body: JSON.stringify({ email, password: PASSWORD, name: `load${index}` }),
  })
  if (response.status !== 200) throw new Error(`sign-up ${index} failed: ${response.status} ${await response.text()}`)
  const { user } = (await response.json()) as { user: { id: string } }
  // Waiting for the verification mail is not part of the load; sign-in needs the flag to be set.
  await ownerSql`update "user" set "emailVerified" = true where id = ${user.id}`
  return { index, email, id: user.id }
}

/**
 * 50 tasks per account: 10 unsorted inbox lines, 20 spread over the four blocks, 5 musts for today
 * and 15 finished today. One INSERT … SELECT over generate_series, as ebb_app with app.uid() set:
 * RLS stays on, only the personal space of that account is in reach.
 */
async function seedTasks(account: Account, today: string): Promise<number> {
  const inserted = await withUser(account.id, (tx) => tx<{ id: string }[]>`
    insert into task (space_id, created_by, title, slot, do_date, must, status, completed_at, position)
    select s.id, app.uid(),
           case when n <= 10 then 'Inbox ' || n
                when n <= 30 then 'Block ' || n
                when n <= 35 then 'Must ' || n
                else 'Done ' || n end,
           case when n <= 10 then 'inbox' else 'block' || ((n % 4) + 1) end,
           case when n <= 10 then null else ${today}::date end,
           n > 30 and n <= 35,
           case when n > 35 then 'done' else 'todo' end,
           case when n > 35 then now() end,
           n
      from space s, generate_series(1, ${TASKS_PER_USER}) as n
     where s.owner_id = app.uid() and s.kind = 'personal'
    returning id
  `)
  if (inserted.length !== TASKS_PER_USER) {
    throw new Error(`account ${account.index}: ${inserted.length} tasks, expected ${TASKS_PER_USER}`)
  }
  return inserted.length
}

/** Signs one account in and returns its cookies the way a browser would send them back. */
async function signIn(account: Account): Promise<string> {
  const response = await app.request('/api/auth/sign-in/email', {
    method: 'POST',
    headers: requestHeaders(account.index),
    body: JSON.stringify({ email: account.email, password: PASSWORD }),
  })
  if (response.status !== 200) throw new Error(`sign-in ${account.index} failed: ${response.status} ${await response.text()}`)
  return response.headers
    .getSetCookie()
    .map((value) => value.split(';')[0] ?? '')
    .join('; ')
}

const started = Date.now()
// user_settings defaults: timezone UTC, day start 04:00. All seeded accounts keep those defaults.
const today = localDate(new Date(), 'UTC', 240)

const accounts: Account[] = []
let nextAccountLog = 500
for (let index = 0; index < users; index += BATCH) {
  const batch = await Promise.all(
    Array.from({ length: Math.min(BATCH, users - index) }, (_, offset) => createAccount(index + offset)),
  )
  accounts.push(...batch)
  if (accounts.length >= nextAccountLog) {
    console.log(`accounts: ${accounts.length}/${users}`)
    nextAccountLog += 500
  }
}

let tasks = 0
let nextLog = 500
for (let index = 0; index < accounts.length; index += BATCH) {
  const batch = accounts.slice(index, index + BATCH)
  tasks += (await Promise.all(batch.map((account) => seedTasks(account, today)))).reduce((sum, n) => sum + n, 0)
  if (tasks >= nextLog) {
    console.log(`tasks: ${tasks} of ${accounts.length * TASKS_PER_USER}`)
    nextLog += 500
  }
}

const cookies: string[] = []
for (const account of accounts.slice(0, Math.min(SESSION_USERS, accounts.length))) {
  cookies.push(await signIn(account))
}
await writeFile(SESSIONS_FILE, JSON.stringify(cookies))

console.log(
  `${accounts.length} accounts, ${tasks} tasks, ${cookies.length} cookies in ${SESSIONS_FILE} (${Math.round((Date.now() - started) / 1000)} s)`,
)

await closeDb()
await ownerSql.end()
// Better Auth's own pool has no exported close(); without this the script would keep running.
process.exit(0)
