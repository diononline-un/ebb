import type { Page } from '@playwright/test'
import { expect, test } from './fixtures.ts'
import { APP_NAME } from '../src/shared/brand.ts'

const PASSWORD = 'correct horse battery'
const VERIFICATION_SUBJECT = `Confirm your email for ${APP_NAME}`

function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`
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

  // A new account starts with the onboarding, not with the board (PRD F2).
  await page.goto(link as string)
  await expect(page).toHaveURL(/\/welcome$/)
}

test('the onboarding leads to a first day in fifteen taps', async ({ page }) => {
  await register(page, uniqueEmail('welcome'))

  // 1 Start, 2 goal, 3 Continue, 4 habit, 5 Continue, 6 Continue after the dump, 7 and 8 "→ Task",
  // 9 Continue, 10 and 11 sorting, 12 the errand, 13 Choose anchor, 14 the task, 15 Done.
  await page.getByRole('button', { name: 'Start', exact: true }).click()

  await expect(page.getByText('What are you doing this for?')).toBeVisible()
  await page.getByRole('button', { name: 'Be calmer at work', exact: true }).click()
  await page.getByRole('button', { name: 'Continue', exact: true }).click()

  await expect(page.getByText('What would you like to do regularly?')).toBeVisible()
  await page.getByRole('button', { name: 'Ten minutes of tidying', exact: true }).click()
  await page.getByRole('button', { name: 'Continue', exact: true }).click()

  await expect(page.getByText('What must not slip your mind?')).toBeVisible()
  const composer = page.getByRole('textbox', { name: 'Add a thought' })
  for (const thought of ['write the invoice', 'buy stamps']) {
    await composer.fill(thought)
    await composer.press('Enter')
  }
  // The field empties only after the thought was kept.
  await expect(composer).toHaveValue('')
  await page.getByRole('button', { name: 'Continue', exact: true }).click()

  await expect(page.getByText('Which of these is a task?')).toBeVisible()
  const toTask = page.getByRole('button', { name: '→ Task', exact: true })
  await expect(toTask).toHaveCount(2)
  await toTask.first().click()
  // The converted line drops its button, so the next one moves up.
  await expect(toTask).toHaveCount(1)
  await toTask.first().click()
  await expect(toTask).toHaveCount(0)
  await page.getByRole('button', { name: 'Continue', exact: true }).click()

  await expect(page.getByText('What breaks if this waits until tomorrow?')).toBeVisible()
  await page.getByRole('button', { name: /Something real, it's a must today/ }).click()
  await page.getByRole('button', { name: 'Block 1', exact: true }).click()
  await page.getByRole('button', { name: /It's a small errand/ }).click()

  // Step 7 is the anchor question, and the sorting already ends on it.
  await expect(page.getByText('Choose your anchor')).toBeVisible()
  await page.getByRole('button', { name: 'Choose anchor', exact: true }).click()
  await page.getByRole('button', { name: 'write the invoice', exact: true }).click()

  await expect(page.getByText('When should the day start?')).toBeVisible()
  await page.getByRole('button', { name: 'Done', exact: true }).click()

  // The first day is there: the anchor, the habit and the goal all around it.
  await expect(page).toHaveURL(/\/today$/)
  await expect(page.locator('li').filter({ hasText: 'write the invoice' }).first()).toBeVisible()
  await expect(page.getByText('Habits today')).toBeVisible()
  await expect(page.getByText('Ten minutes of tidying')).toBeVisible()

  await page.goto('/goals')
  await expect(page.getByText('Be calmer at work')).toBeVisible()
})

test('an abort comes back to the step it stopped on', async ({ page }) => {
  await register(page, uniqueEmail('welcome-abort'))

  await page.getByRole('button', { name: 'Start', exact: true }).click()
  await expect(page.getByText('What are you doing this for?')).toBeVisible()
  await page.getByRole('button', { name: 'Skip', exact: true }).click()
  await expect(page.getByText('What would you like to do regularly?')).toBeVisible()
  await page.getByRole('button', { name: 'Skip', exact: true }).click()
  await expect(page.getByText('What must not slip your mind?')).toBeVisible()

  // Reload after step 4: the stored step brings the person back there.
  await page.reload()
  await expect(page).toHaveURL(/\/welcome$/)
  await expect(page.getByText('What must not slip your mind?')).toBeVisible()
})
