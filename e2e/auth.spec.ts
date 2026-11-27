import type { Page } from '@playwright/test'
import { expect, test } from './fixtures.ts'
import { APP_NAME } from '../src/shared/brand.ts'

const PASSWORD = 'correct horse battery'
const VERIFICATION_SUBJECT = `Confirm your email for ${APP_NAME}`

function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`
}

/**
 * Finishes the onboarding from inside the page: an in-page fetch keeps the session cookie in the
 * browser's own jar, while page.request can rotate it under a hard navigation.
 */
async function markOnboarded(page: Page): Promise<void> {
  const ok = await page.evaluate(async () => (await fetch('/api/onboarding/done', { method: 'POST' })).ok)
  expect(ok).toBe(true)
}

async function signUp(page: Page, email: string): Promise<void> {
  await page.goto('/sign-up')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account', exact: true }).click()
  await expect(page).toHaveURL(/\/verify-email/)
}

/** Development captures mails instead of sending them: GET /api/dev/mails returns the outbox. */
async function confirmByMail(page: Page, email: string): Promise<void> {
  const response = await page.request.get('/api/dev/mails')
  expect(response.ok()).toBe(true)
  const mails = (await response.json()) as { to: string; subject: string; text: string }[]
  const mail = mails.filter((entry) => entry.to === email && entry.subject === VERIFICATION_SUBJECT).at(-1)
  expect(mail, 'verification mail for the new account').toBeTruthy()

  const link = /https?:\/\/\S+/.exec(mail?.text ?? '')?.[0]
  expect(link, 'verification link inside the mail text').toBeTruthy()

  await page.goto(link as string)

  // The onboarding owns the first visit (E4) and counts as the first ritual; these flows start after it.
  await markOnboarded(page)
  await page.goto('/today')
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible()
}

test('sign up, confirm by mail, sign out everywhere, sign in with the password', async ({ page }) => {
  const email = uniqueEmail('password')
  await signUp(page, email)
  await confirmByMail(page, email)

  await page.goto('/settings/security')
  await page.getByRole('button', { name: 'Sign out everywhere', exact: true }).click()
  await expect(page).toHaveURL(/\/sign-in/)

  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL(/\/today$/)
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible()
})

test('add a passkey and sign in with it', async ({ page, context }) => {
  // Chromium's virtual authenticator stands in for a phone's platform authenticator.
  const client = await context.newCDPSession(page)
  await client.send('WebAuthn.enable')
  const { authenticatorId } = await client.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  })

  const email = uniqueEmail('passkey')
  await signUp(page, email)
  await confirmByMail(page, email)

  await page.goto('/settings/security')
  await page.getByRole('button', { name: 'Add a passkey', exact: true }).click()
  await expect(page.getByRole('button', { name: /Remove passkey/ })).toBeVisible()

  const stored = await client.send('WebAuthn.getCredentials', { authenticatorId })
  expect(stored.credentials).toHaveLength(1)

  await page.getByRole('button', { name: 'Sign out everywhere', exact: true }).click()
  await expect(page).toHaveURL(/\/sign-in/)

  await page.getByRole('button', { name: 'Sign in with a passkey', exact: true }).click()
  await expect(page).toHaveURL(/\/today$/)
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible()
})
