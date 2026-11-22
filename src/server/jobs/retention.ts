import { withSystem, type Tx } from '../db.ts'
import { deleteAccount } from '../domain/account/delete.ts'
import { env } from '../env.ts'
import { sendMail } from '../mail.ts'

// E9-P5: the retention job. It runs in the system role because it looks at all accounts at once.
// The rule (PRD F15, docs/specs/E09-betrieb.md): an account with no access (trial over, no active
// subscription, no seat) and no login for 12 months is removed. 30 days before the removal date the
// person gets a warning, 7 days before the final one. The marks in user_access make a daily run send
// each mail once.

/** Months without access or login after which an account is deleted. */
const DELETE_AFTER_MONTHS = 12
const WARN_DAYS_BEFORE = 30
const FINAL_WARN_DAYS_BEFORE = 7
const DAY_MS = 24 * 60 * 60 * 1000

export type RetentionResult = { warned: number; finalWarned: number; deleted: number }

type InactiveAccount = {
  userId: string
  email: string
  lastActivityAt: Date
  deletionWarnedAt: Date | null
  deletionFinalWarnedAt: Date | null
}

/** Calendar arithmetic in the user's favour: a month is a month, and the run happens once a day. */
function shift(date: Date, months: number, days: number): Date {
  const moved = new Date(date)
  moved.setMonth(moved.getMonth() + months)
  moved.setDate(moved.getDate() + days)
  return moved
}

/**
 * Accounts close enough to removal to matter: trial over, no active subscription and nobody's seat,
 * and the last sign of life older than the warning threshold. "Last sign of life" is the newest
 * session row or user_access.last_seen_at, whichever is later.
 */
async function findInactive(tx: Tx, earliest: Date): Promise<InactiveAccount[]> {
  return tx<InactiveAccount[]>`
    select ua.user_id, u.email, ua.deletion_warned_at, ua.deletion_final_warned_at,
           greatest(ua.last_seen_at,
                    coalesce((select max(s."createdAt") from "session" s where s."userId" = ua.user_id),
                             ua.last_seen_at)) as last_activity_at
      from user_access ua
      join "user" u on u.id = ua.user_id
     where (ua.trial_ends_at is null or ua.trial_ends_at <= now())
       and not exists (select 1 from subscription sub
                        where sub.payer_user_id = ua.user_id
                          and sub.status in ('active', 'trialing', 'past_due'))
       and not exists (select 1 from subscription_seat seat
                         join subscription sub on sub.id = seat.subscription_id
                        where seat.user_id = ua.user_id
                          and sub.status in ('active', 'trialing', 'past_due'))
       and greatest(ua.last_seen_at,
                    coalesce((select max(s."createdAt") from "session" s where s."userId" = ua.user_id),
                             ua.last_seen_at)) <= ${earliest}
     order by last_activity_at`
}

/** Sends the two warnings and removes what is due. Returns the counts the caller logs. */
export async function runRetention(now: Date = new Date()): Promise<RetentionResult> {
  // Selfhost: access never expires, so there is no inactivity rule to apply.
  if (env.APP_MODE === 'selfhost') return { warned: 0, finalWarned: 0, deleted: 0 }

  const accounts = await withSystem((tx) => findInactive(tx, shift(now, -DELETE_AFTER_MONTHS, WARN_DAYS_BEFORE)))
  const result: RetentionResult = { warned: 0, finalWarned: 0, deleted: 0 }

  for (const account of accounts) {
    const removalAt = shift(account.lastActivityAt, DELETE_AFTER_MONTHS, 0)
    const daysLeft = (removalAt.getTime() - now.getTime()) / DAY_MS
    const date = removalAt.toISOString().slice(0, 10)

    if (daysLeft <= 0) {
      await deleteAccount(account.userId)
      result.deleted += 1
      continue
    }

    if (daysLeft <= FINAL_WARN_DAYS_BEFORE && account.deletionFinalWarnedAt === null) {
      await sendMail({
        to: account.email,
        subject: 'Your Ebb account will be deleted in 7 days',
        text: `Nobody signed in to this account for almost a year, and it has no running plan. We will delete it and everything in it on ${date}.\n\nSign in once to keep it. Export your data first if you want a copy.`,
      })
      await withSystem(
        (tx) => tx`
          update user_access
             set deletion_warned_at = coalesce(deletion_warned_at, now()), deletion_final_warned_at = now()
           where user_id = ${account.userId}`,
      )
      result.finalWarned += 1
      continue
    }

    if (daysLeft <= WARN_DAYS_BEFORE && account.deletionWarnedAt === null) {
      await sendMail({
        to: account.email,
        subject: 'Your Ebb account will be deleted',
        text: `Nobody signed in to this account for almost a year, and it has no running plan. We will delete it and everything in it on ${date}.\n\nSign in once to keep it. Export your data first if you want a copy.`,
      })
      await withSystem(
        (tx) => tx`update user_access set deletion_warned_at = now() where user_id = ${account.userId}`,
      )
      result.warned += 1
    }
  }

  return result
}

/** Starts the daily loop the server runs; the first pass comes one interval after the start. */
export function startRetentionJob(intervalMs = DAY_MS): () => void {
  const timer = setInterval(() => {
    void runRetention().catch((error: unknown) => {
      console.error('retention job failed', error)
    })
  }, intervalMs)
  timer.unref()
  return () => clearInterval(timer)
}
