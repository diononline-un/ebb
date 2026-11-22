import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { InviteIssued, Member, Space } from '../../../shared/schemas/spaces.ts'
import { apiFetch } from '../../lib/api.ts'

const SPACES_KEY = ['spaces'] as const

/** `enabled` keeps the join page quiet: it shows no space before the person has joined one. */
export function useSpaces(enabled = true) {
  return useQuery({ queryKey: SPACES_KEY, queryFn: () => apiFetch<Space[]>('/api/spaces'), enabled })
}

/** The people of one space; it stays idle while the page has no space yet. */
export function useMembers(spaceId: string | null) {
  return useQuery({
    queryKey: ['spaces', spaceId ?? '', 'members'] as const,
    queryFn: () => apiFetch<Member[]>(`/api/spaces/${spaceId}/members`),
    enabled: spaceId !== null,
  })
}

export async function createSpace(name: string): Promise<Space> {
  return apiFetch<Space>('/api/spaces', { method: 'POST', body: JSON.stringify({ name }) })
}

export async function renameSpace(id: string, name: string): Promise<Space> {
  return apiFetch<Space>(`/api/spaces/${id}`, { method: 'PATCH', body: JSON.stringify({ name }) })
}

/** Deleting is owner only and needs the name typed again, so the body carries it. */
export async function deleteSpace(id: string, name: string): Promise<void> {
  await apiFetch(`/api/spaces/${id}`, { method: 'DELETE', body: JSON.stringify({ name }) })
}

export async function removeMember(spaceId: string, userId: string): Promise<void> {
  await apiFetch(`/api/spaces/${spaceId}/members/${userId}`, { method: 'DELETE' })
}

export async function leaveSpace(spaceId: string): Promise<void> {
  await apiFetch(`/api/spaces/${spaceId}/leave`, { method: 'POST' })
}

/** The token comes back once; only its hash stays on the server. */
export async function createInvite(spaceId: string): Promise<InviteIssued> {
  return apiFetch<InviteIssued>(`/api/spaces/${spaceId}/invites`, { method: 'POST', body: JSON.stringify({}) })
}

export async function joinSpace(token: string): Promise<{ spaceId: string }> {
  return apiFetch<{ spaceId: string }>('/api/spaces/join', { method: 'POST', body: JSON.stringify({ token }) })
}

/** Every space write moves the list, the people and the tasks of the space. */
function useSpaceWrite<TInput, TResult = unknown>(write: (input: TInput) => Promise<TResult>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: write,
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: SPACES_KEY })
    },
  })
}

export function useCreateSpace() {
  return useSpaceWrite((name: string) => createSpace(name))
}

export function useRenameSpace() {
  return useSpaceWrite(({ id, name }: { id: string; name: string }) => renameSpace(id, name))
}

export function useDeleteSpace() {
  return useSpaceWrite(({ id, name }: { id: string; name: string }) => deleteSpace(id, name))
}

export function useRemoveMember() {
  return useSpaceWrite(({ spaceId, userId }: { spaceId: string; userId: string }) => removeMember(spaceId, userId))
}

export function useLeaveSpace() {
  return useSpaceWrite((spaceId: string) => leaveSpace(spaceId))
}

export function useCreateInvite() {
  return useSpaceWrite((spaceId: string) => createInvite(spaceId))
}

export function useJoinSpace() {
  return useSpaceWrite((token: string) => joinSpace(token))
}
