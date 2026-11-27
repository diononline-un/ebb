// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { NotificationsPage } from '../../src/web/features/settings/NotificationsPage.tsx'
import { WeekdayPicker } from '../../src/web/features/settings/WeekdayPicker.tsx'
import { i18nReady } from '../../src/web/lib/i18n.ts'

const state = vi.hoisted(() => ({
  settings: {
    morningReminder: '07:30',
    weeklyResetDow: 0,
    weeklyResetTime: '18:00',
    errandsDow: null,
    quietStart: '21:00',
    quietEnd: '07:00',
    notify: { morning: false, habits: true, weeklyReset: true, errands: true, timer: true, trial: true },
  },
}))

const spies = vi.hoisted(() => ({ patch: vi.fn() }))

vi.mock('../../src/web/features/settings/api.ts', () => ({
  useSettings: () => ({ data: state.settings, isPending: false }),
  usePatchSettings: () => ({ mutateAsync: spies.patch }),
}))

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children }: { to: string; children?: ReactNode }) => <a href={to}>{children}</a>,
}))

beforeAll(async () => {
  await i18nReady
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <NotificationsPage />
    </QueryClientProvider>,
  )
}

describe('NotificationsPage', () => {
  it('patches a reminder type when its checkbox is ticked', async () => {
    const { getByLabelText } = renderPage()

    fireEvent.click(getByLabelText('Morning ritual'))

    await waitFor(() => expect(spies.patch).toHaveBeenCalledWith({ notify: { morning: true } }))
  })

  it('sends null when the morning time is cleared', async () => {
    const { getByLabelText } = renderPage()

    fireEvent.change(getByLabelText('Morning time'), { target: { value: '' } })

    await waitFor(() => expect(spies.patch).toHaveBeenCalledWith({ morningReminder: null }))
  })

  it('says in one line when the browser cannot push', () => {
    const { getByText } = renderPage()

    expect(getByText('This browser cannot show reminders.')).toBeTruthy()
  })
})

describe('WeekdayPicker', () => {
  it('sends the schema number of the chosen weekday', () => {
    const onChange = vi.fn()
    const { getByRole } = render(<WeekdayPicker label="Weekly reset day" value={0} onChange={onChange} />)

    expect(getByRole('button', { name: 'Sun' }).getAttribute('aria-pressed')).toBe('true')

    fireEvent.click(getByRole('button', { name: 'Mon' }))

    expect(onChange).toHaveBeenCalledWith(1)
  })
})
