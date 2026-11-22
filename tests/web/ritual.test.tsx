// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { TodayView } from '../../src/shared/schemas/task.ts'
import { ritualSkipped } from '../../src/web/features/ritual/api.ts'
import { Ritual } from '../../src/web/features/ritual/RitualPage.tsx'
import { i18nReady } from '../../src/web/lib/i18n.ts'

// The dump box and the start button have their own callers; here they only have to render.
vi.mock('../../src/web/features/dump/api.ts', () => ({
  useDumpSubmit: () => ({ submit: async () => true, busy: false, error: null }),
}))

vi.mock('../../src/web/features/focus/api.ts', () => ({
  useStartFocus: () => ({ mutate: () => {}, isPending: false }),
  useTimerDefault: () => 25,
}))

beforeAll(async () => {
  await i18nReady
})

afterEach(() => {
  cleanup()
  localStorage.clear()
})

function view(patch: Partial<TodayView> = {}): TodayView {
  return {
    date: '2026-11-22',
    energy: null,
    rolledCount: 0,
    anchor: null,
    must: [],
    slots: { inbox: [], block1: [], block2: [], block3: [], block4: [] },
    errandsOpen: 0,
    doneToday: [],
    ritualDoneAt: null,
    ...patch,
  }
}

function ritualProps(patch: Partial<TodayView> = {}) {
  return {
    view: view(patch),
    usualMinutes: 25,
    onEnergy: vi.fn(async () => undefined),
    onFinish: vi.fn(async () => undefined),
    onTriage: vi.fn(async () => {}),
    onChooseAnchor: vi.fn(async () => 'ok' as const),
    onGoToday: vi.fn(),
    onGoLow: vi.fn(),
  }
}

describe('Ritual', () => {
  it('sends a low day into the low-energy mode without the rollover step', async () => {
    const props = ritualProps()
    const { getByRole, getByText, queryByText } = render(<Ritual {...props} />)

    expect(getByText('How much battery do you have today?')).toBeTruthy()
    fireEvent.click(getByRole('button', { name: 'Low' }))

    await waitFor(() => expect(props.onEnergy).toHaveBeenCalledWith('low'))
    expect(getByText('What is on your mind?')).toBeTruthy()
    expect(queryByText(/came along from yesterday/)).toBeNull()

    fireEvent.click(getByRole('button', { name: 'Skip' }))
    await waitFor(() => expect(getByText('Choose your anchor')).toBeTruthy())
    fireEvent.click(getByRole('button', { name: 'Skip' }))

    await waitFor(() => expect(props.onFinish).toHaveBeenCalled())
    expect(props.onGoLow).toHaveBeenCalled()
    expect(props.onGoToday).not.toHaveBeenCalled()
  })

  it('shows the rollover note when tasks came along', async () => {
    const props = ritualProps({ rolledCount: 3 })
    const { getByRole, getByText, queryByText } = render(<Ritual {...props} />)

    fireEvent.click(getByRole('button', { name: 'Good' }))
    await waitFor(() => expect(getByText(/3 tasks came along from yesterday/)).toBeTruthy())
    expect(queryByText('What is on your mind?')).toBeNull()

    fireEvent.click(getByRole('button', { name: 'Continue' }))
    expect(getByText('What is on your mind?')).toBeTruthy()
  })

  it('leaves with a marker for today', () => {
    const props = ritualProps()
    const { getByRole } = render(<Ritual {...props} />)

    fireEvent.click(getByRole('button', { name: 'Leave' }))

    expect(ritualSkipped('2026-11-22')).toBe(true)
    expect(props.onGoToday).toHaveBeenCalled()
    expect(props.onFinish).not.toHaveBeenCalled()
  })

  it('offers the first block on a good day and finishes on Not now', async () => {
    const props = ritualProps()
    const { getByRole, getByText } = render(<Ritual {...props} />)

    fireEvent.click(getByRole('button', { name: 'Good' }))
    await waitFor(() => expect(props.onEnergy).toHaveBeenCalledWith('good'))

    fireEvent.click(getByRole('button', { name: 'Skip' }))
    await waitFor(() => expect(getByText('Choose your anchor')).toBeTruthy())
    fireEvent.click(getByRole('button', { name: 'Skip' }))

    await waitFor(() => expect(getByText('Ready for the first block?')).toBeTruthy())
    expect(getByRole('button', { name: 'Start 25 min' })).toBeTruthy()

    fireEvent.click(getByRole('button', { name: 'Not now' }))
    await waitFor(() => expect(props.onFinish).toHaveBeenCalled())
    expect(props.onGoToday).toHaveBeenCalled()
    expect(props.onGoLow).not.toHaveBeenCalled()
  })
})
