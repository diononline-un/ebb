import { withSystem, type Tx } from '../../db.ts'

/**
 * E9-P5: deletes an account for good (PRD F17). The auth row is the parent of every app table, so one
 * delete takes the personal space with its tasks and projects, the dump lines, goals, habits and their
 * logs, recurrences, focus sessions, weekly resets, day entries, settings, access row, push
 * subscriptions and the subscription with its seats.
 *
 * What must not go with it is work other people still live in: shared spaces stay, and their tasks go
 * back to "nobody" (PRD F15). Both are done before the delete, because the foreign keys alone would
 * take the space of a sole owner and leave planning fields of a vanished person behind.
 */
export async function deleteAccount(userId: string): Promise<void> {
  // System role, and it has to be: the auth tables belong to ebb_auth, so nobody deletes a login
  // through the request role. The rows below belong to a person whose request is over, and the RLS
  // policies are written for a request of that person.
  await withSystem(async (tx) => {
    await handOverSharedSpaces(tx, userId)
    await releaseAssignedTasks(tx, userId)
    await tx`delete from "user" where id = ${userId}`
  })
}

/**
 * A shared space survives its owner (PRD F15: only spaces without members are deleted). space.owner_id
 * cascades, so the longest-standing other member becomes owner first; the personal space has no other
 * member and goes with the account.
 */
async function handOverSharedSpaces(tx: Tx, userId: string): Promise<void> {
  const successors = await tx<{ spaceId: string; userId: string }[]>`
    select distinct on (m.space_id) m.space_id, m.user_id
      from space_member m
      join space s on s.id = m.space_id
     where s.owner_id = ${userId} and m.user_id <> ${userId}
     order by m.space_id, m.joined_at, m.user_id`

  for (const successor of successors) {
    await tx`
      update space_member set role = 'owner'
       where space_id = ${successor.spaceId} and user_id = ${successor.userId}`
    await tx`update space set owner_id = ${successor.userId} where id = ${successor.spaceId}`
  }
}

/**
 * The tasks assigned to a person in a shared space fall back to "nobody" (PRD F13). The foreign key
 * would only null the assignee and keep slot, must, anchor and do date pointing at a plan of someone
 * who is gone, so the row is released the same way app.leave_space releases it.
 */
async function releaseAssignedTasks(tx: Tx, userId: string): Promise<void> {
  await tx`
    update task set assignee_id = null, slot = 'inbox', must = false, anchor = false, do_date = null
     where assignee_id = ${userId}
       and space_id in (select id from space where kind = 'shared')`
}
