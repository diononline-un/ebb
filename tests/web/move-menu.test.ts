// @ts-nocheck — the component under test is a .tsx module and tsconfig.server (which checks
// tests/) sets no jsx flag. Turning it on would change a config outside this package.
// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { createElement } from 'react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { i18nReady } from '../../src/web/lib/i18n.ts'
import { MoveMenu } from '../../src/web/features/today/MoveMenu.tsx'

beforeAll(async () => {
  await i18nReady
})

afterEach(() => {
  cleanup()
})

function openMenu(getByRole) {
  const trigger = getByRole('button', { name: /Move/ })
  trigger.focus()
  fireEvent.keyDown(trigger, { key: 'Enter' })
  return trigger
}

describe('MoveMenu', () => {
  it('moves a task into a block without any pointer', async () => {
    const onMove = vi.fn()
    const { getByRole, findByText } = render(createElement(MoveMenu, { taskTitle: 'write the invoice', onMove }))

    openMenu(getByRole)
    const item = await findByText('Block 2')
    fireEvent.click(item)

    await waitFor(() => expect(onMove).toHaveBeenCalledTimes(1))
    expect(onMove).toHaveBeenCalledWith({ slot: 'block2' })
  })

  it('offers the inbox, errands and another day', async () => {
    const onMove = vi.fn()
    const { getByRole, findByText } = render(createElement(MoveMenu, { taskTitle: 'write the invoice', onMove }))

    openMenu(getByRole)
    expect(await findByText('To the inbox')).toBeTruthy()
    expect(await findByText('To errands')).toBeTruthy()
    expect(await findByText('To another day…')).toBeTruthy()
    expect(onMove).not.toHaveBeenCalled()
  })

  it('sends errands as a slot and another day as a date', async () => {
    const onMove = vi.fn()
    const { getByRole, findByText, findByLabelText } = render(
      createElement(MoveMenu, { taskTitle: 'write the invoice', onMove }),
    )

    openMenu(getByRole)
    fireEvent.click(await findByText('To errands'))
    await waitFor(() => expect(onMove).toHaveBeenCalledWith({ slot: 'errands' }))

    openMenu(getByRole)
    fireEvent.click(await findByText('To another day…'))
    const input = await findByLabelText('Date')
    fireEvent.change(input, { target: { value: '2026-12-01' } })
    fireEvent.click(getByRole('button', { name: 'Move it' }))

    await waitFor(() => expect(onMove).toHaveBeenCalledWith({ doDate: '2026-12-01' }))
  })
})
