// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Member, Space } from '../../src/shared/schemas/spaces.ts'
import { SpacePage } from '../../src/web/features/spaces/SpacePage.tsx'
import { SpacesPage } from '../../src/web/features/spaces/SpacesPage.tsx'
import { ApiError } from '../../src/web/lib/api.ts'
import { i18nReady } from '../../src/web/lib/i18n.ts'

const personal: Space = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Just me',
  kind: 'personal',
  role: 'owner',
  memberCount: 1,
}

const shared: Space = {
  id: '22222222-2222-4222-8222-222222222222',
  name: 'Move house',
  kind: 'shared',
  role: 'owner',
  memberCount: 2,
}

const owner: Member = {
  userId: 'user-1',
  email: 'ada@example.test',
  name: 'Ada',
  role: 'owner',
  joinedAt: '2026-11-22T09:00:00.000Z',
}

const mate: Member = {
  userId: 'user-2',
  email: 'ben@example.test',
  name: 'Ben',
  role: 'member',
  joinedAt: '2026-11-22T09:00:00.000Z',
}

const state = vi.hoisted(() => ({ spaces: [] as Space[], members: [] as Member[] }))

const spies = vi.hoisted(() => ({
  create: vi.fn(),
  rename: vi.fn(),
  invite: vi.fn(),
  removeMember: vi.fn(),
  leave: vi.fn(),
  deleteSpace: vi.fn(),
  navigate: vi.fn(async () => {}),
}))

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children }: { to: string; children?: ReactNode }) => <a href={to}>{children}</a>,
  useNavigate: () => spies.navigate,
}))

vi.mock('../../src/web/features/spaces/api.ts', () => ({
  useSpaces: () => ({ data: state.spaces, isPending: false }),
  useMembers: () => ({ data: state.members, isPending: false }),
  useUnassigned: () => ({ data: [], isPending: false }),
  useCreateSpace: () => ({ mutateAsync: spies.create }),
  useRenameSpace: () => ({ mutateAsync: spies.rename }),
  useCreateInvite: () => ({ mutateAsync: spies.invite }),
  useRemoveMember: () => ({ mutateAsync: spies.removeMember }),
  useLeaveSpace: () => ({ mutateAsync: spies.leave }),
  useDeleteSpace: () => ({ mutateAsync: spies.deleteSpace }),
}))

beforeAll(async () => {
  await i18nReady
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  state.spaces = []
  state.members = []
})

function withClient(children: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}>{children}</QueryClientProvider>)
}

describe('SpacesPage', () => {
  it('creates a shared space from the list', async () => {
    state.spaces = [personal]
    spies.create.mockResolvedValue(shared)
    const { getByLabelText, getByRole, getByText } = withClient(<SpacesPage />)

    expect(getByText('Just me')).toBeTruthy()
    expect(getByText('Personal space · 1 person')).toBeTruthy()

    fireEvent.click(getByRole('button', { name: 'New space' }))
    fireEvent.change(getByLabelText('Space'), { target: { value: '  Move house  ' } })
    fireEvent.click(getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(spies.create).toHaveBeenCalledTimes(1))
    expect(spies.create).toHaveBeenCalledWith('Move house')
  })

  it('says one quiet line when the space does not save', async () => {
    state.spaces = [personal]
    spies.create.mockRejectedValue(new ApiError(422, 'unknown_space'))
    const { getByLabelText, getByRole, findByRole } = withClient(<SpacesPage />)

    fireEvent.click(getByRole('button', { name: 'New space' }))
    fireEvent.change(getByLabelText('Space'), { target: { value: 'Move house' } })
    fireEvent.click(getByRole('button', { name: 'Save' }))

    const alert = await findByRole('alert')
    expect(alert.textContent).toBe('That did not save. Check the connection and try again.')
  })
})

describe('SpacePage', () => {
  it('shows the invitation link once, with the share and copy path', async () => {
    state.spaces = [personal, shared]
    state.members = [owner, mate]
    spies.invite.mockResolvedValueOnce({ id: 'invite-1', token: 'tok-one', expiresAt: '2026-11-29T09:00:00.000Z' })
    const { getByRole, getAllByText, queryAllByText } = withClient(<SpacePage spaceId={shared.id} />)

    fireEvent.click(getByRole('button', { name: 'Invite someone' }))

    const first = 'http://localhost:3000/join/tok-one'
    await waitFor(() => expect(getAllByText(first)).toHaveLength(1))
    expect(getByRole('button', { name: 'Copy link' })).toBeTruthy()

    // A second invitation replaces the first: the old token never stays on screen.
    spies.invite.mockResolvedValueOnce({ id: 'invite-2', token: 'tok-two', expiresAt: '2026-11-29T09:00:00.000Z' })
    fireEvent.click(getByRole('button', { name: 'Invite someone' }))
    const second = 'http://localhost:3000/join/tok-two'
    await waitFor(() => expect(getAllByText(second)).toHaveLength(1))
    expect(queryAllByText(first)).toHaveLength(0)

    fireEvent.click(getByRole('button', { name: 'Done' }))
    expect(queryAllByText(second)).toHaveLength(0)
  })

  it('answers a name that does not match with one quiet line', async () => {
    state.spaces = [personal, shared]
    state.members = [owner, mate]
    spies.deleteSpace.mockRejectedValue(new ApiError(422, 'name_mismatch'))
    const { findByRole, getByRole } = withClient(<SpacePage spaceId={shared.id} />)

    fireEvent.click(getByRole('button', { name: 'Delete space' }))
    const dialog = await findByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('Type the name of the space'), {
      target: { value: 'Move house now' },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }))

    const alert = await findByRole('alert')
    expect(alert.textContent).toBe('The name did not match. The space stays as it is.')
    expect(spies.deleteSpace).toHaveBeenCalledWith({ id: shared.id, name: 'Move house now' })
    expect(spies.navigate).not.toHaveBeenCalled()
  })

  it('removes a member and leaves the owner row alone', async () => {
    state.spaces = [personal, shared]
    state.members = [owner, mate]
    spies.removeMember.mockResolvedValue(undefined)
    const { getByRole, queryByRole } = withClient(<SpacePage spaceId={shared.id} />)

    expect(getByRole('button', { name: 'Remove Ben' })).toBeTruthy()
    expect(queryByRole('button', { name: 'Remove Ada' })).toBeNull()

    fireEvent.click(getByRole('button', { name: 'Remove Ben' }))
    await waitFor(() => expect(spies.removeMember).toHaveBeenCalledWith({ spaceId: shared.id, userId: mate.userId }))
  })
})
