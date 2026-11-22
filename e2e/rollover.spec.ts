import { expect, test, type Page } from '@playwright/test'

const PASSWORD = 'correct horse battery'

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
  const link = /https?:\/\/\S+/.exec(mails.filter((entry) => entry.to === email).at(-1)?.text ?? '')?.[0]
  expect(link).toBeTruthy()

  await page.goto(link as string)
  await expect(page).toHaveURL(/\/today$/)
}

test('a task from yesterday comes along when the day starts', async ({ page }) => {
  await register(page, uniqueEmail('rollover'))

  // One task for today, put into Block 2 so the rollover visibly resets the slot.
  const created = await page.request.post('/api/tasks', { data: { title: 'the thing from yesterday' } })
  const { task } = (await created.json()) as { task: { id: string } }
  await page.request.patch(`/api/tasks/${task.id}`, { data: { slot: 'block2' } })

  await page.goto('/today')
  await expect(page.locator('h2', { hasText: 'Block 2' })).toBeVisible()
  await expect(page.getByText('the thing from yesterday')).toBeVisible()

  // Move the user's clock one day forward: the next request starts a new day and rolls the task over.
  const clock = await page.request.post('/api/dev/clock', { data: { offsetMinutes: 24 * 60 } })
  expect(clock.status()).toBe(200)

  await page.goto('/today')
  await expect(page.getByText('1 task came along from yesterday. It is waiting in your inbox.')).toBeVisible()
  await expect(page.locator('h2', { hasText: 'Inbox' })).toBeVisible()
  await expect(page.getByText('the thing from yesterday')).toBeVisible()
  await expect(page.locator('h2', { hasText: 'Block 2' })).toHaveCount(0)

  // The pushed counter lives in Plan, and it now says 1.
  await page.goto('/plan')
  await page.getByRole('tab', { name: 'Inbox', exact: true }).click()
  await expect(page.getByText('the thing from yesterday')).toBeVisible()

  // Reset the clock so the rest of the run is back on today's date.
  const reset = await page.request.post('/api/dev/clock', { data: { offsetMinutes: 0 } })
  expect(reset.status()).toBe(200)
})

test('the dev clock only exists behind /api/dev', async ({ page }) => {
  const response = await page.request.post('/api/clock', { data: { offsetMinutes: 60 } })
  expect(response.status()).toBe(404)
  expect((await response.json()).code).toBe('not_found')

  // The dev clock exists (it answers 401 without a session, not 404) and validates its body.
  const anonymous = await page.request.post('/api/dev/clock', { data: { offsetMinutes: 60 } })
  expect(anonymous.status()).toBe(401)
})
