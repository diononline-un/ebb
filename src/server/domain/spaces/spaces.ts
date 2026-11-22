import { createHash, randomBytes } from 'node:crypto'
import type { Tx } from '../../db.ts'
import { INVITE_DAYS, type InviteIssued, type Member, type Space } from '../../../shared/schemas/spaces.ts'

/** 32 random bytes, hex. The database only ever sees the hash. */
function newInviteToken(): string {
  return randomBytes(32).toString('hex')
}

function hashInviteToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

/** A space rule said no; the route turns it into its HTTP answer. */
export class SpaceError extends Error {
  readonly status: 404 | 409 | 422
  readonly code: string

  constructor(status: 404 | 409 | 422, code: string) {
    super(code)
    this.name = 'SpaceError'
    this.status = status
    this.code = code
  }
}

type SpaceRow = { id: string; name: string; kind: 'personal' | 'shared'; role: 'owner' | 'member'; memberCount: number }

const SPACE_SQL = `
  select s.id, s.name, s.kind, m.role,
         (select count(*)::int from space_member other where other.space_id = s.id) as member_count
    from space s
    join space_member m on m.space_id = s.id and m.user_id = app.uid()`

function toSpace(row: SpaceRow): Space {
  return { id: row.id, name: row.name, kind: row.kind, role: row.role, memberCount: row.memberCount }
}

export async function listSpaces(tx: Tx): Promise<Space[]> {
  const rows = await tx.unsafe<SpaceRow[]>(`${SPACE_SQL} order by (s.kind = 'shared'), s.created_at`)
  return rows.map(toSpace)
}

export async function createSharedSpace(tx: Tx, name: string): Promise<Space> {
  const [row] = await tx<{ createSharedSpace: string }[]>`select app.create_shared_space(${name})`
  if (!row) throw new Error('create_shared_space returned nothing')
  const spaces = await listSpaces(tx)
  const created = spaces.find((space) => space.id === row.createSharedSpace)
  if (!created) throw new Error('created space missing after insert')
  return created
}

async function memberRow(tx: Tx, spaceId: string): Promise<Space> {
  const [row] = await tx.unsafe<SpaceRow[]>(`${SPACE_SQL} where s.id = $1`, [spaceId])
  if (!row) throw new SpaceError(404, 'not_found')
  return toSpace(row)
}

/** Only the owner invites; the token is returned once and stored as a hash. */
export async function createInvite(tx: Tx, spaceId: string, email: string | null): Promise<InviteIssued> {
  const space = await memberRow(tx, spaceId)
  if (space.role !== 'owner') throw new SpaceError(422, 'owner_only')

  const token = newInviteToken()
  const [row] = await tx<{ id: string; expiresAt: Date }[]>`
    insert into space_invite (space_id, token_hash, email, created_by, expires_at)
    values (${spaceId}, ${hashInviteToken(token)}, ${email}, app.uid(), now() + ${`${INVITE_DAYS} days`}::interval)
    returning id, expires_at`
  if (!row) throw new Error('space_invite insert returned nothing')
  return { id: row.id, token, expiresAt: row.expiresAt.toISOString() }
}

export async function revokeInvite(tx: Tx, inviteId: string): Promise<void> {
  const [row] = await tx<{ id: string }[]>`delete from space_invite where id = ${inviteId} returning id`
  if (!row) throw new SpaceError(404, 'not_found')
}

/**
 * Accepting an expired, used or unknown token answers the same: the caller learns nothing about
 * which of the three it was.
 */
export async function acceptInvite(tx: Tx, token: string): Promise<{ spaceId: string }> {
  try {
    const [row] = await tx<{ acceptInvite: string }[]>`select app.accept_invite(${hashInviteToken(token)})`
    if (!row?.acceptInvite) throw new SpaceError(404, 'invite_invalid')
    return { spaceId: row.acceptInvite }
  } catch (error) {
    if (error instanceof SpaceError) throw error
    // The function raises 'invite_invalid' for all three cases; nothing else is expected here.
    if (error instanceof Error && error.message.includes('invite_invalid')) {
      throw new SpaceError(404, 'invite_invalid')
    }
    throw error
  }
}

export async function listMembers(tx: Tx, spaceId: string): Promise<Member[]> {
  await memberRow(tx, spaceId)
  // Names and mails come from the auth table through a definer function (only ebb_auth may read it).
  const rows = await tx<{ userId: string; email: string; name: string; role: 'owner' | 'member'; joinedAt: Date }[]>`
    select user_id, email, name, role, joined_at from app.space_members(${spaceId})`
  return rows.map((row) => ({
    userId: row.userId,
    email: row.email,
    name: row.name,
    role: row.role,
    joinedAt: row.joinedAt.toISOString(),
  }))
}

/** The rule answers of app.leave_space and app.remove_member, translated for the route. */
const MEMBER_CHECKS: Record<string, [404 | 422, string]> = {
  not_a_member: [404, 'not_found'],
  owner_only: [422, 'owner_only'],
  owner_cannot_leave: [422, 'owner_cannot_leave'],
  personal_space: [422, 'personal_space'],
}

async function memberCall(tx: Tx, run: () => Promise<unknown>): Promise<void> {
  try {
    await run()
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    const mapped = Object.entries(MEMBER_CHECKS).find(([key]) => message.includes(key))
    if (!mapped) throw error
    throw new SpaceError(mapped[1][0], mapped[1][1])
  }
}

/**
 * The tasks of a person leaving go back to "nobody" and lose their plan (PRD F13). The request role
 * does it while the membership still exists, because the RLS policies are written for it; the
 * definer function then only removes the membership.
 */
async function releaseTasks(tx: Tx, spaceId: string, userId: string): Promise<void> {
  await tx`
    update task set assignee_id = null, slot = 'inbox', must = false, anchor = false, do_date = null
     where space_id = ${spaceId} and assignee_id = ${userId}`
}

/** The owner removes a member; tasks of that person in the space fall back to "nobody". */
export async function removeMember(tx: Tx, spaceId: string, userId: string): Promise<void> {
  await memberRow(tx, spaceId)
  await releaseTasks(tx, spaceId, userId)
  await memberCall(tx, () => tx`select app.remove_member(${spaceId}, ${userId})`)
}

/** A member leaves; the owner has to delete the space instead (the owner cannot walk away). */
export async function leaveSpace(tx: Tx, spaceId: string): Promise<void> {
  await memberRow(tx, spaceId)
  const [me] = await tx<{ uid: string }[]>`select app.uid() as uid`
  if (me?.uid) await releaseTasks(tx, spaceId, me.uid)
  await memberCall(tx, () => tx`select app.leave_space(${spaceId})`)
}

/** Deleting needs the name typed again, so a shared space never vanishes by a stray tap. */
export async function deleteSpace(tx: Tx, spaceId: string, confirmedName: string): Promise<void> {
  const space = await memberRow(tx, spaceId)
  if (space.kind === 'personal') throw new SpaceError(422, 'personal_space')
  if (space.role !== 'owner') throw new SpaceError(422, 'owner_only')
  if (confirmedName !== space.name) throw new SpaceError(422, 'name_mismatch')

  await tx`delete from space where id = ${spaceId}`
}

export async function renameSpace(tx: Tx, spaceId: string, name: string): Promise<Space> {
  const space = await memberRow(tx, spaceId)
  if (space.role !== 'owner') throw new SpaceError(422, 'owner_only')
  await tx`update space set name = ${name} where id = ${spaceId}`
  return memberRow(tx, spaceId)
}
