import { spawn } from 'node:child_process'
import { join } from 'node:path'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'

// env.ts reads REGISTRATION when it loads, so the mode goes into process.env before any src import.
// The file runs in its own worker (vitest.config.ts: fileParallelism false), so the closed mode
// cannot leak into tests/auth.test.ts.
process.env['REGISTRATION'] = 'closed'

const { createApp } = await import('../src/server/app.ts')
const { registrationAllowed } = await import('../src/server/auth.ts')
const { closeDb } = await import('../src/server/db.ts')
const { env } = await import('../src/server/env.ts')
const { ownerSql, resetDb, TEST_PASSWORD, createUser } = await import('./harness.ts')

const app = createApp()
const ROOT = join(import.meta.dirname, '..')
const NEW_PASSWORD = 'a whole new password'
let ipCounter = 0

function signUp(email: string, password = TEST_PASSWORD) {
  ipCounter += 1
  return app.request('/api/auth/sign-up/email', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: env.APP_URL,
      'x-forwarded-for': `10.2.0.${ipCounter}`,
    },
    body: JSON.stringify({ email, password, name: email.split('@')[0] }),
  })
}

function signIn(email: string, password: string) {
  ipCounter += 1
  return app.request('/api/auth/sign-in/email', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: env.APP_URL,
      'x-forwarded-for': `10.3.0.${ipCounter}`,
    },
    body: JSON.stringify({ email, password }),
  })
}

type CliRun = { code: number; stdout: string; stderr: string }

/** Runs src/server/cli.ts in its own process, like the runbook does inside the container. */
function runCli(args: string[], input: string): Promise<CliRun> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['src/server/cli.ts', ...args], {
      cwd: ROOT,
      env: process.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => {
      stdout += chunk
    })
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => {
      stderr += chunk
    })
    child.on('error', reject)
    child.on('close', (code) => resolve({ code: code ?? -1, stdout, stderr }))
    child.stdin.end(input)
  })
}

beforeEach(async () => {
  await resetDb()
})

afterAll(async () => {
  await closeDb()
  await ownerSql.end()
})

describe('registrationAllowed', () => {
  it('lets everyone in while registration is open', () => {
    expect(registrationAllowed('open', 5, false)).toBe(true)
    expect(registrationAllowed('open', 0, false)).toBe(true)
  })

  it('closes the gate after the first account but keeps the CLI exception', () => {
    expect(registrationAllowed('closed', 0, false)).toBe(true)
    expect(registrationAllowed('closed', 1, false)).toBe(false)
    expect(registrationAllowed('closed', 3, true)).toBe(true)
  })
})

describe('closed registration over HTTP', () => {
  it('lets the first account through and refuses the second with 403', async () => {
    expect((await signUp('first@example.test')).status).toBe(200)

    const second = await signUp('second@example.test')
    expect(second.status).toBe(403)
    expect(await second.json()).toMatchObject({ code: 'registration_closed' })
  })

  it('keeps the CLI able to create accounts although the HTTP route stays closed', async () => {
    expect((await signUp('owner@example.test')).status).toBe(200)

    const created = await runCli(['create-user', 'cli@example.test', 'Cli Person'], `${NEW_PASSWORD}\n`)
    expect(created.stderr).toBe('')
    expect(created.code).toBe(0)
    expect(created.stdout).toContain('cli@example.test')

    // The CLI account works: its verification flag was set through the Better Auth API.
    expect((await signIn('cli@example.test', NEW_PASSWORD)).status).toBe(200)
    // The flag stays inside the CLI process; another sign-up is still refused.
    expect((await signUp('third@example.test')).status).toBe(403)
  })
})

describe('reset-password', () => {
  it('sets a password that signs in and ends the old session', async () => {
    const user = await createUser('reset@example.test')
    expect((await app.request('/api/me', { headers: { cookie: user.cookie } })).status).toBe(200)

    const result = await runCli(['reset-password', user.email], `${NEW_PASSWORD}\n`)
    expect(result.code).toBe(0)
    expect(result.stdout).toContain(user.email)
    expect(result.stdout + result.stderr).not.toContain(NEW_PASSWORD)

    // Every session of the account is gone, so the old cookie is worthless.
    expect((await app.request('/api/me', { headers: { cookie: user.cookie } })).status).toBe(401)
    // The new password opens a session.
    expect((await signIn(user.email, NEW_PASSWORD)).status).toBe(200)
    // The old one no longer does.
    expect((await signIn(user.email, TEST_PASSWORD)).status).toBe(401)
  })

  it('exits 1 for a password that is too short', async () => {
    const user = await createUser('short@example.test')
    const result = await runCli(['reset-password', user.email], 'short\n')
    expect(result.code).toBe(1)
    expect(result.stderr).toMatch(/at least 10 characters/)
  })

  it('exits 2 for a command it does not know', async () => {
    const result = await runCli(['not-a-command'], '')
    expect(result.code).toBe(2)
    expect(result.stderr).toContain('usage:')
  })
})
