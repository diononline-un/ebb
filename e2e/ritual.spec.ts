import { expect, test, type Page } from '@playwright/test'

const PASSWORD = 'correct horse battery'
const VERIFICATION_SUBJECT = 'Confirm your email for Ebb'

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

async function register(page: Page, email: string): Promise<void> {
  await page.goto('/sign-up')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account', exact: true }).click()
  await expect(page).toHaveURL(/\/verify-email/)

  const response = await page.request.get('/api/dev/mails')
  const mails = (await response.json()) as { to: string; subject: string; text: string }[]
  const mail = mails.filter((entry) => entry.to === email && entry.subject === VERIFICATION_SUBJECT).at(-1)
  const link = /https?:\/\/\S+/.exec(mail?.text ?? '')?.[0]
  expect(link).toBeTruthy()

  // The onboarding owns the first visit (E4) and finishes the first day's ritual with it, so the
  // next day is the one that opens the ritual again.
  await page.goto(link as string)
  await expect(page).toHaveURL(/\/welcome$/)
  await markOnboarded(page)
  // A day later the ritual opens again; the clock runs inside the page for the same cookie reason.
  const clock = await page.evaluate(async () => {
    const res = await fetch('/api/dev/clock', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ offsetMinutes: 24 * 60 }),
    })
    return res.ok
  })
  expect(clock).toBe(true)
  await page.goto('/today')
  await expect(page).toHaveURL(/\/ritual$/)
}

test('the first day runs through the ritual, and only once', async ({ page }) => {
  await register(page, uniqueEmail('ritual'))

  // One task from yesterday's inbox; the second one comes out of the ritual's own dump.
  const created = await page.request.post('/api/tasks', { data: { title: 'write the invoice' } })
  expect(created.status()).toBe(201)

  // Eight clicks for two inbox tasks (Good, Done, four answers, Choose anchor, the task, Not now),
  // plus the Enter that keeps the thought and the one tap that makes it a task.
  await page.getByRole('button', { name: 'Good', exact: true }).click()

  const composer = page.getByRole('textbox', { name: 'Add a thought' })
  await composer.fill('buy stamps')
  await composer.press('Enter')
  // The composer empties only after the thought was kept.
  await expect(composer).toHaveValue('')
  // What was just dumped has to reach the sorting in the same ritual, not wait on /dump.
  await page.getByRole('button', { name: '→ Task', exact: true }).click()
  await expect(page.getByText('buy stamps')).toHaveCount(0)
  await page.getByRole('button', { name: 'Done', exact: true }).click()

  // Sorting works exactly as on /triage.
  await expect(page.getByText('What breaks if this waits until tomorrow?')).toBeVisible()
  await page.getByRole('button', { name: /Something real, it's a must today/ }).click()
  await expect(page.getByText('Which block?')).toBeVisible()
  await page.getByRole('button', { name: 'Block 1', exact: true }).click()
  await page.getByRole('button', { name: /It's a small errand/ }).click()

  // The anchor from the task that just became a must.
  await expect(page.getByText('Choose your anchor')).toBeVisible()
  await page.getByRole('button', { name: 'Choose anchor', exact: true }).click()
  await page.getByRole('button', { name: 'write the invoice', exact: true }).click()

  await expect(page.getByText('Ready for the first block?')).toBeVisible()
  await page.getByRole('button', { name: 'Not now', exact: true }).click()

  await expect(page).toHaveURL(/\/today$/)
  await expect(page.locator('li').filter({ hasText: 'write the invoice' }).first()).toBeVisible()

  // The ritual is done for today: opening Today again stays on Today.
  await page.goto('/today')
  await expect(page).toHaveURL(/\/today$/)
  await expect(page.getByText('Start your day')).toHaveCount(0)
})
