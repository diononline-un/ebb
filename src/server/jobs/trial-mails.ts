import { APP_NAME } from '../../shared/brand.ts'
import { addDays, localDate } from '../../shared/day.ts'
import { hasAccess, type SubscriptionFacts, type SubscriptionStatus } from '../../shared/entitlement.ts'
import { withSystem, withUser, type Tx } from '../db.ts'
import { weekStats } from '../domain/reset/stats.ts'
import { env } from '../env.ts'
import { sendMail } from '../mail.ts'

// E8-P8: the two trial mails, "ends in 2 days" with the numbers of the week so far and "has ended".
// The job runs in the system role because it looks at all accounts at once; the marks in user_access
// make each mail go out once per account. The week numbers run in withUser, because weekStats reads
// under RLS. Subjects and texts are English server code like the retention mails (E9-P2 localises).

const SOON_DAYS = 2
const ENDED_DAYS = 3
const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS

export type TrialMailResult = { soon: number; ended: number }

type TrialAccount = {
  userId: string
  email: string
  trialEndsAt: Date
  trialSoonMailedAt: Date | null
  trialEndMailedAt: Date | null
  ownStatus: SubscriptionStatus | null
  ownPeriodEnd: Date | null
  seatStatus: SubscriptionStatus | null
  seatPeriodEnd: Date | null
}

/**
 * Accounts with a trial and a mail still open. The own subscription and the seat come along so that
 * hasAccess() can answer whether anything besides the trial carries the person; at most one row each.
 */
function findTrialAccounts(tx: Tx): Promise<TrialAccount[]> {
  return tx<TrialAccount[]>`
    select ua.user_id, u.email, ua.trial_ends_at, ua.trial_soon_mailed_at, ua.trial_end_mailed_at,
           own.status as own_status, own.current_period_end as own_period_end,
           seat_sub.status as seat_status, seat_sub.current_period_end as seat_period_end
      from user_access ua
      join "user" u on u.id = ua.user_id
      left join lateral (
        select s.status, s.current_period_end
          from subscription s
         where s.payer_user_id = ua.user_id
         order by s.updated_at desc
         limit 1) own on true
      left join lateral (
        select s.status, s.current_period_end
          from subscription_seat seat
          join subscription s on s.id = seat.subscription_id
         where seat.user_id = ua.user_id) seat_sub on true
     where ua.trial_ends_at is not null
       and (ua.trial_soon_mailed_at is null or ua.trial_end_mailed_at is null)`
}

function facts(status: SubscriptionStatus | null, currentPeriodEnd: Date | null): SubscriptionFacts | null {
  return status === null ? null : { status, currentPeriodEnd }
}

/** "1 task", "2 tasks": keeps the mail readable without an i18n layer in the server code. */
function count(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}

function dateOf(at: Date): string {
  return at.toISOString().slice(0, 10)
}

type WeekSoFar = { anchorDays: number; tasksDone: number; focusMinutes: number }

/** The numbers of the last seven local days, read as the person under RLS. */
async function weekSoFar(userId: string, now: Date): Promise<WeekSoFar> {
  return withUser(userId, async (tx) => {
    const [settings] = await tx<{ timezone: string; dayStartMinute: number }[]>`
      select timezone, day_start_minute from user_settings where user_id = app.uid()`
    const today = localDate(now, settings?.timezone ?? 'UTC', settings?.dayStartMinute ?? 240)
    const stats = await weekStats(tx, addDays(today, -6), today)
    return { anchorDays: stats.anchorDays, tasksDone: stats.tasksDone, focusMinutes: stats.focusMinutes }
  })
}

/** Calm, no pressure (DESIGN.md §9): the state of the trial, the week so far, the way to a plan. */
function soonMail(trialEndsAt: Date, week: WeekSoFar): { subject: string; text: string } {
  return {
    subject: `Your ${APP_NAME} trial ends in 2 days`,
    text: [
      `Your trial ends on ${dateOf(trialEndsAt)}.`,
      '',
      `Your week so far: an anchor on ${week.anchorDays} of 7 days, ${count(week.tasksDone, 'task', 'tasks')} done, ` +
        `${count(week.focusMinutes, 'minute', 'minutes')} of focus.`,
      '',
      `To keep planning, choose a plan: ${env.APP_URL}/settings/billing`,
    ].join('\n'),
  }
}

function endedMail(trialEndsAt: Date): { subject: string; text: string } {
  return {
    subject: `Your ${APP_NAME} trial has ended`,
    text: [
      `Your trial ended on ${dateOf(trialEndsAt)}. Everything is still here, and you can export it any time.`,
      '',
      `Subscribe to keep planning: ${env.APP_URL}/settings/billing`,
    ].join('\n'),
  }
}

/**
 * Sends the two trial mails. A failed send leaves the mark unset, so the next hourly run tries again,
 * and never stops the run for the other accounts. Counts come back for the caller to log.
 */
export async function runTrialMails(now: Date = new Date()): Promise<TrialMailResult> {
  const accounts = await withSystem(findTrialAccounts)
  const result: TrialMailResult = { soon: 0, ended: 0 }

  for (const account of accounts) {
    // trialEndsAt: null asks the shared rule only about subscription and seat, so the trial itself
    // does not count as the other access we are looking for. Selfhost answers true here.
    const covered = hasAccess({
      mode: env.APP_MODE,
      now,
      trialEndsAt: null,
      ownSubscription: facts(account.ownStatus, account.ownPeriodEnd),
      seatSubscription: facts(account.seatStatus, account.seatPeriodEnd),
    }).access
    if (covered) continue

    const msLeft = account.trialEndsAt.getTime() - now.getTime()

    try {
      if (msLeft > 0 && msLeft <= SOON_DAYS * DAY_MS && account.trialSoonMailedAt === null) {
        await sendMail({ to: account.email, ...soonMail(account.trialEndsAt, await weekSoFar(account.userId, now)) })
        await withSystem((tx) => tx`update user_access set trial_soon_mailed_at = now() where user_id = ${account.userId}`)
        result.soon += 1
      } else if (msLeft <= 0 && msLeft >= -ENDED_DAYS * DAY_MS && account.trialEndMailedAt === null) {
        await sendMail({ to: account.email, ...endedMail(account.trialEndsAt) })
        await withSystem((tx) => tx`update user_access set trial_end_mailed_at = now() where user_id = ${account.userId}`)
        result.ended += 1
      }
    } catch (error) {
      // No mail address in the log; the user id is enough to find the account.
      // Code and name only: SMTP error objects and messages can carry the recipient address.
      const code = error instanceof Error ? ((error as { code?: string }).code ?? error.name) : 'unknown'
      console.error(`trial mail failed for user ${account.userId}: ${code}`)
    }
  }

  return result
}

/** Starts the hourly loop the server runs; the first pass comes one interval after the start. */
export function startTrialMailJob(intervalMs = HOUR_MS): () => void {
  const timer = setInterval(() => {
    void runTrialMails().catch((error: unknown) => {
      console.error('trial mail job failed', error)
    })
  }, intervalMs)
  timer.unref()
  return () => clearInterval(timer)
}
