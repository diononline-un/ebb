// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { i18nReady } from '../../src/web/lib/i18n.ts'
import { HabitsStep } from '../../src/web/features/onboarding/HabitsStep.tsx'
import { GoalsStep } from '../../src/web/features/onboarding/GoalsStep.tsx'
import { OnboardingPage } from '../../src/web/features/onboarding/OnboardingPage.tsx'

const spies = vi.hoisted(() => ({
  saveStep: vi.fn(async () => ({ step: 2 })),
  finish: vi.fn(async () => ({ onboardingDoneAt: '2026-11-22T10:00:00.000Z' })),
  patchSettings: vi.fn(async () => {}),
  createGoal: vi.fn(async (input: { title: string }) => ({ id: `goal-${input.title}`, title: input.title })),
  createHabit: vi.fn(async (input: { name: string }) => ({ id: `habit-${input.name}` })),
  toTask: vi.fn(async () => {}),
  archive: vi.fn(async () => {}),
  dumpSubmit: vi.fn(async () => true),
  triage: vi.fn(async () => ({})),
  navigate: vi.fn(async () => {}),
  state: { onboardingStep: 0, onboardingDoneAt: null as string | null, timezone: 'UTC' },
}))

vi.mock('../../src/web/features/onboarding/api.ts', () => ({
  useMe: () => ({
    data: {
      user: { id: 'user-1', email: 'a@example.test', name: 'a' },
      settings: {
        timezone: spies.state.timezone,
        morningReminder: null,
        weeklyResetDow: 0,
        weeklyResetTime: '18:00',
        onboardingStep: spies.state.onboardingStep,
        onboardingDoneAt: spies.state.onboardingDoneAt,
      },
    },
  }),
  useSaveStep: () => ({ mutateAsync: spies.saveStep }),
  useFinishOnboarding: () => ({ mutateAsync: spies.finish }),
  patchSettings: spies.patchSettings,
}))

vi.mock('../../src/web/features/goals/api.ts', () => ({
  useCreateGoal: () => ({ mutateAsync: spies.createGoal }),
  useGoals: () => ({ data: [] }),
}))

vi.mock('../../src/web/features/habits/api.ts', () => ({
  useCreateHabit: () => ({ mutateAsync: spies.createHabit }),
}))

vi.mock('../../src/web/features/dump/api.ts', () => ({
  useDumpLines: () => ({ data: [] }),
  useDumpActions: () => ({ toTask: spies.toTask, archive: spies.archive }),
  useDumpSubmit: () => ({ submit: spies.dumpSubmit, busy: false, error: null }),
}))

vi.mock('../../src/web/features/tasks/api.ts', () => ({
  useToday: () => ({
    data: {
      date: '2026-11-22',
      energy: null,
      rolledCount: 0,
      anchor: null,
      must: [],
      slots: { inbox: [], block1: [], block2: [], block3: [], block4: [] },
      errandsOpen: 0,
      doneToday: [],
      ritualDoneAt: null,
    },
  }),
  usePatchTask: () => ({ mutateAsync: spies.triage }),
  triageTask: spies.triage,
}))

vi.mock('@tanstack/react-router', () => ({
  useRouter: () => ({ navigate: spies.navigate }),
}))

beforeAll(async () => {
  await i18nReady
})

/** The page asks the query client for cache work; everything else it needs is mocked. */
function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <OnboardingPage />
    </QueryClientProvider>,
  )
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  spies.state.onboardingStep = 0
  spies.state.onboardingDoneAt = null
})

describe('OnboardingPage', () => {
  it('starts at the welcome and remembers the next step', async () => {
    const { getByRole, getByText } = renderPage()

    expect(getByText("Let's set up your day.")).toBeTruthy()
    fireEvent.click(getByRole('button', { name: 'Start' }))

    await waitFor(() => expect(spies.saveStep).toHaveBeenCalledWith(2))
    await waitFor(() => expect(getByText('What are you doing this for?')).toBeTruthy())
  })

  it('comes back to the step it stopped on', () => {
    spies.state.onboardingStep = 4
    const { getByText } = renderPage()

    expect(getByText('What must not slip your mind?')).toBeTruthy()
  })

  it('finishes from the last step and leaves for today', async () => {
    spies.state.onboardingStep = 8
    const { getByRole, getByText } = renderPage()

    expect(getByText('When should the day start?')).toBeTruthy()
    fireEvent.click(getByRole('button', { name: 'Done' }))

    await waitFor(() => expect(spies.patchSettings).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(spies.finish).toHaveBeenCalledTimes(1))
    expect(spies.navigate).toHaveBeenCalledWith({ to: '/today' })
  })
})

describe('GoalsStep', () => {
  it('creates the chosen goals and hands them on', async () => {
    const onDone = vi.fn()
    const { getByRole, getByText } = render(<GoalsStep onDone={onDone} />)

    fireEvent.click(getByText('Be calmer at work'))
    fireEvent.click(getByText('Have the evenings for myself'))
    fireEvent.click(getByRole('button', { name: 'Continue' }))

    await waitFor(() => expect(spies.createGoal).toHaveBeenCalledTimes(2))
    expect(spies.createGoal).toHaveBeenCalledWith({ title: 'Be calmer at work' })
    await waitFor(() =>
      expect(onDone).toHaveBeenCalledWith([
        { id: 'goal-Be calmer at work', title: 'Be calmer at work' },
        { id: 'goal-Have the evenings for myself', title: 'Have the evenings for myself' },
      ]),
    )
  })

  it('stops at three goals', () => {
    const { getByText, queryByText } = render(<GoalsStep onDone={() => {}} />)

    fireEvent.click(getByText('Be calmer at work'))
    fireEvent.click(getByText('Have the evenings for myself'))
    fireEvent.click(getByText('Finish what I start'))
    expect(getByText('Three goals are enough to start.')).toBeTruthy()
    expect(queryByText('Three goals are enough to start.')).toBeTruthy()
  })
})

describe('HabitsStep', () => {
  it('stops at two habits', async () => {
    const onDone = vi.fn()
    const { getByRole, getByText } = render(<HabitsStep goalId="goal-1" onDone={onDone} />)

    fireEvent.click(getByText('Ten minutes of tidying'))
    fireEvent.click(getByText('A page before bed'))
    fireEvent.click(getByText('A walk after lunch'))
    expect(getByText('Two habits are enough for now.')).toBeTruthy()

    fireEvent.click(getByRole('button', { name: 'Continue' }))
    await waitFor(() => expect(spies.createHabit).toHaveBeenCalledTimes(2))
    expect(spies.createHabit).toHaveBeenCalledWith({ name: 'Ten minutes of tidying', cadence: 'daily', goalId: 'goal-1' })
    expect(onDone).toHaveBeenCalled()
  })
})
