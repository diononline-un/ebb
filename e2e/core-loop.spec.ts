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

  await page.goto(link as string)
  // The onboarding owns the first visit (E4) and counts as the first ritual; these flows start after it.
  await markOnboarded(page)
  await page.goto('/today')
  await expect(page).toHaveURL(/\/today$/)
}

test('dump three thoughts, sort two, pick the anchor, tick it off', async ({ page }) => {
  await register(page, uniqueEmail('core'))

  // --- brain dump -------------------------------------------------------
  await page.goto('/dump')
  const composer = page.getByRole('textbox', { name: 'Add a thought' })
  for (const thought of ['call the landlord', 'invoice for March', 'book a haircut']) {
    await composer.fill(thought)
    await composer.press('Enter')
    await expect(page.getByText(thought)).toBeVisible()
  }

  // --- two of them become tasks ----------------------------------------
  const row = (text: string) => page.locator('li').filter({ hasText: text }).first()
  await row('call the landlord').getByRole('button', { name: '→ Task' }).click()
  await expect(row('call the landlord').getByRole('link', { name: 'Open task' })).toBeVisible()
  await row('invoice for March').getByRole('button', { name: '→ Task' }).click()
  await expect(row('invoice for March').getByRole('link', { name: 'Open task' })).toBeVisible()

  // --- sort them with the consequence question -------------------------
  await page.goto('/triage')
  await expect(page.getByText('What breaks if this waits until tomorrow?')).toBeVisible()
  const firstTask = await page.getByText(/call the landlord|invoice for March/).first().innerText()

  await page.getByRole('button', { name: /Something real, it's a must today/ }).click()
  await expect(page.getByText('Which block?')).toBeVisible()
  await page.getByRole('button', { name: 'Block 1', exact: true }).click()

  await expect(page.getByText('What breaks if this waits until tomorrow?')).toBeVisible()
  await page.getByRole('button', { name: /Nothing much, pick a day/ }).click()
  await expect(page.getByText('Which day suits it?')).toBeVisible()
  await page.getByRole('button', { name: 'Tomorrow', exact: true }).click()

  // --- the anchor, then tick it off ------------------------------------
  await expect(page.getByText('Choose your anchor')).toBeVisible()
  await page.getByRole('button', { name: 'Choose anchor', exact: true }).click()
  await page.getByRole('button', { name: firstTask, exact: true }).click()
  await expect(page).toHaveURL(/\/today$/)

  const tide = page.locator('.ebb-tide-line')
  await expect(tide).toBeVisible()
  // The chosen task is the anchor, so it sits in the anchor row above the tide line and not again
  // in "Must today" (the API keeps anchor and must in their own fields).
  const anchorRow = page.locator('li').filter({ hasText: firstTask }).first()
  await expect(anchorRow).toBeVisible()
  await anchorRow.getByRole('checkbox').click()
  await expect(page.getByText('Marked as done.')).toBeVisible()
  await expect(tide).toBeVisible()
  await expect(page.locator('.ebb-tide-line--in')).toHaveCount(1)

  // The second task waits for tomorrow, the third thought is still in the dump.
  await page.goto('/plan')
  await page.getByRole('tab', { name: 'Tomorrow', exact: true }).click()
  await expect(page.getByText(/call the landlord|invoice for March/)).toBeVisible()

  await page.goto('/dump')
  await expect(page.getByText('book a haircut')).toBeVisible()
})
