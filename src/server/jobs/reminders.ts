import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { localDate, weekStart } from '../../shared/day.ts'
import {
  dueReminders,
  type Due,
  type ReminderFacts,
  type ReminderHabit,
  type ReminderSettings,
  type ReminderTimer,
} from '../../shared/reminders.ts'
import type { Notify } from '../../shared/schemas/settings.ts'
import { withSystem, type Tx } from '../db.ts'
import { deliverToUser } from '../push/deliver.ts'
import { sendPush, type PushPayload, type PushResult, type PushTarget } from '../push/send.ts'

// E9-P2: the reminder job (PRD F14, docs/architektur.md "Jobs"). It runs as ebb_system because it
// reads every account at once, and it is the only writer of reminder_sent. The rules live in
// src/shared/reminders.ts; this file loads the facts in one query per table and delivers the pushes.
// The ledger row is claimed before the push goes out, so a parallel run cannot send a reminder twice.

export type ReminderRun = { sent: number; skipped: number }

type Send = (target: PushTarget, payload: PushPayload) => Promise<PushResult>

type Subscriber = { userId: string; locale: string; settings: ReminderSettings }

const MINUTE_MS = 60 * 1000
const KEEP_DAYS = 30
const DAY_MS = 24 * 60 * MINUTE_MS

/** Read once at module start: the job runs every minute and should not touch the disk in between. */
const LOCALES_DIR = join(import.meta.dirname, '..', '..', '..', 'locales')

type Bundle = Record<string, unknown>
type LocalesMeta = Record<string, { reviewed?: boolean }>

function readJson<T>(path: string): T | null {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T
  } catch {
    return null
  }
}

const meta = readJson<LocalesMeta>(join(LOCALES_DIR, '.meta.json')) ?? {}
const bundles = new Map<string, Bundle>()
for (const language of new Set(['en', ...Object.keys(meta)])) {
  const bundle = readJson<Bundle>(join(LOCALES_DIR, language, 'reminders.json'))
  if (bundle !== null) bundles.set(language, bundle)
}
if (!bundles.has('en')) {
  console.warn('reminders: locales/en/reminders.json is missing, push texts stay keys')
}

/** English unless the language is reviewed in locales/.meta.json and carries a reminders file. */
function bundleOf(locale: string): Bundle {
  if (locale !== 'en' && meta[locale]?.reviewed === true) {
    const bundle = bundles.get(locale)
    if (bundle !== null && bundle !== undefined) return bundle
  }
  return bundles.get('en') ?? {}
}

/** Resolves "morning.title" in the nested JSON; undefined when a key is missing. */
function lookup(bundle: Bundle, key: string): string | undefined {
  let value: unknown = bundle
  for (const part of key.split('.')) {
    if (typeof value !== 'object' || value === null) return undefined
    value = (value as Record<string, unknown>)[part]
  }
  return typeof value === 'string' ? value : undefined
}

/** `{{name}}` is the only templating a push gets; i18next stays in the web bundle. */
function fill(template: string, vars: Record<string, string> | undefined): string {
  if (vars === undefined) return template
  let text = template
  for (const [name, value] of Object.entries(vars)) text = text.replaceAll(`{{${name}}}`, value)
  return text
}

function payloadOf(locale: string, due: Due): PushPayload {
  const bundle = bundleOf(locale)
  const english = bundles.get('en') ?? {}
  const text = (key: string) => fill(lookup(bundle, key) ?? lookup(english, key) ?? key, due.vars)
  return { title: text(due.titleKey), body: text(due.bodyKey), url: due.url }
}

/** Only people with a subscription: the ledger is complete for everyone else already. */
function loadSubscribers(tx: Tx): Promise<
  Array<{
    userId: string
    locale: string
    timezone: string
    dayStartMinute: number
    morningReminder: string | null
    weeklyResetDow: number
    weeklyResetTime: string
    errandsDow: number | null
    quietStart: string
    quietEnd: string
    notify: Notify
  }>
> {
  return tx`
    select s.user_id, s.locale, s.timezone, s.day_start_minute,
           s.morning_reminder::text as morning_reminder,
           s.weekly_reset_dow, s.weekly_reset_time::text as weekly_reset_time,
           s.errands_dow, s.quiet_start::text as quiet_start, s.quiet_end::text as quiet_end, s.notify
      from user_settings s
     where exists (select 1 from push_subscription p where p.user_id = s.user_id)
     order by s.user_id`
}

type HabitRow = { id: string; userId: string; name: string; reminderTime: string; weekdays: number[] | null }
type TimerRow = { id: string; userId: string; startedAt: Date; plannedMinutes: number }

/**
 * The facts of all subscribers, one query per table and none per person. Day-scoped rows are joined
 * against the app day (or reset week) each person is in right now.
 */
async function loadFacts(tx: Tx, subscribers: Subscriber[], now: Date): Promise<Map<string, ReminderFacts>> {
  const days = subscribers.map((subscriber) => {
    const today = localDate(now, subscriber.settings.timezone, subscriber.settings.dayStartMinute)
    return {
      userId: subscriber.userId,
      today,
      week: weekStart(today, (subscriber.settings.weeklyResetDow + 1) % 7),
    }
  })
  const ids = days.map((entry) => entry.userId)
  const todayDates = days.map((entry) => entry.today)
  const weekDates = days.map((entry) => entry.week)

  const [ritual, habits, logs, resets, errands, timers, trials] = await Promise.all([
    tx<Array<{ userId: string; ritualDoneAt: Date | null }>>`
      select d.user_id, d.ritual_done_at
        from day_entry d
        join unnest(${ids}::text[], ${todayDates}::date[]) as x(user_id, date)
          on x.user_id = d.user_id and x.date = d.date`,
    tx<HabitRow[]>`
      select id, user_id, name, reminder_time::text as reminder_time, weekdays
        from habit
       where user_id = any(${ids}::text[]) and archived_at is null and reminder_time is not null
       order by position, created_at`,
    tx<Array<{ habitId: string; userId: string }>>`
      select l.habit_id, l.user_id
        from habit_log l
        join unnest(${ids}::text[], ${todayDates}::date[]) as x(user_id, date)
          on x.user_id = l.user_id and x.date = l.date`,
    tx<Array<{ userId: string; completedAt: Date | null }>>`
      select r.user_id, r.completed_at
        from weekly_reset r
        join unnest(${ids}::text[], ${weekDates}::date[]) as w(user_id, week_start)
          on w.user_id = r.user_id and w.week_start = r.week_start`,
    tx<Array<{ userId: string; open: number }>>`
      select assignee_id as user_id, count(*)::int as open
        from task
       where slot = 'errands' and status in ('todo', 'doing') and assignee_id = any(${ids}::text[])
       group by assignee_id`,
    tx<TimerRow[]>`
      select id, user_id, started_at, planned_minutes
        from focus_session
       where ended_at is null and user_id = any(${ids}::text[])`,
    tx<Array<{ userId: string; trialEndsAt: Date | null }>>`
      select user_id, trial_ends_at from user_access where user_id = any(${ids}::text[])`,
  ])

  const ritualDone = new Set(ritual.filter((row) => row.ritualDoneAt !== null).map((row) => row.userId))
  const loggedHabits = new Set(logs.map((row) => row.habitId))
  const resetDone = new Set(resets.filter((row) => row.completedAt !== null).map((row) => row.userId))
  const openErrands = new Map(errands.map((row) => [row.userId, row.open]))
  const trialEnd = new Map(trials.map((row) => [row.userId, row.trialEndsAt]))

  const habitsByUser = new Map<string, ReminderHabit[]>()
  for (const habit of habits) {
    const list = habitsByUser.get(habit.userId) ?? []
    list.push({
      id: habit.id,
      name: habit.name,
      reminderTime: habit.reminderTime,
      weekdays: habit.weekdays,
      doneToday: loggedHabits.has(habit.id),
    })
    habitsByUser.set(habit.userId, list)
  }

  const timersByUser = new Map<string, ReminderTimer[]>()
  for (const timer of timers) {
    const list = timersByUser.get(timer.userId) ?? []
    list.push({ id: timer.id, startedAt: timer.startedAt, plannedMinutes: timer.plannedMinutes })
    timersByUser.set(timer.userId, list)
  }

  return new Map(
    subscribers.map((subscriber) => [
      subscriber.userId,
      {
        ritualDone: ritualDone.has(subscriber.userId),
        habits: habitsByUser.get(subscriber.userId) ?? [],
        weeklyResetDone: resetDone.has(subscriber.userId),
        errandsOpen: openErrands.get(subscriber.userId) ?? 0,
        trialEndsAt: trialEnd.get(subscriber.userId) ?? null,
        timers: timersByUser.get(subscriber.userId) ?? [],
      },
    ]),
  )
}

function keyOf(userId: string, kind: string, ref: string, localDateValue: string): string {
  return `${userId}\u0000${kind}\u0000${ref}\u0000${localDateValue}`
}

/** The ledger keys of the due candidates, in one query over all subscribers. */
async function loadSent(tx: Tx, candidates: Array<{ userId: string; due: Due }>): Promise<Set<string>> {
  if (candidates.length === 0) return new Set()
  const ids = candidates.map((candidate) => candidate.userId)
  const kinds = candidates.map((candidate) => candidate.due.kind)
  const refs = candidates.map((candidate) => candidate.due.ref)
  const dates = candidates.map((candidate) => candidate.due.localDate)
  const rows = await tx<Array<{ userId: string; kind: string; ref: string; localDate: string }>>`
    select r.user_id, r.kind, r.ref, r.local_date::text as local_date
      from reminder_sent r
      join unnest(${ids}::text[], ${kinds}::text[], ${refs}::text[], ${dates}::date[])
        as k(user_id, kind, ref, local_date)
        on k.user_id = r.user_id and k.kind = r.kind and k.ref = r.ref and k.local_date = r.local_date`
  return new Set(rows.map((row) => keyOf(row.userId, row.kind, row.ref, row.localDate)))
}

// One cleanup per UTC day is enough for a ledger that never needs more than a month.
let cleanupDay: string | null = null

async function cleanup(tx: Tx, now: Date): Promise<void> {
  const day = now.toISOString().slice(0, 10)
  if (cleanupDay === day) return
  cleanupDay = day
  await tx`delete from reminder_sent where sent_at < ${new Date(now.getTime() - KEEP_DAYS * DAY_MS)}`
}

/**
 * One run: find due reminders for every subscribed person, claim each in reminder_sent, then push.
 * The counts are what the caller logs. An error stays with its person, so one broken device does not
 * hold back the rest.
 */
export async function runReminders(now: Date = new Date(), send: Send = sendPush): Promise<ReminderRun> {
  // System role: the reminder job looks at every account at once and is the only writer of the
  // ledger. Nothing here may leak into a request path.
  return withSystem(async (tx) => {
    await cleanup(tx, now)

    const subscribers: Subscriber[] = (await loadSubscribers(tx)).map((row) => ({
      userId: row.userId,
      locale: row.locale,
      settings: {
        timezone: row.timezone,
        dayStartMinute: row.dayStartMinute,
        morningReminder: row.morningReminder,
        weeklyResetDow: row.weeklyResetDow,
        weeklyResetTime: row.weeklyResetTime,
        errandsDow: row.errandsDow,
        quietStart: row.quietStart,
        quietEnd: row.quietEnd,
        notify: row.notify,
      },
    }))
    if (subscribers.length === 0) return { sent: 0, skipped: 0 }

    const facts = await loadFacts(tx, subscribers, now)
    const dueByUser = new Map<string, Due[]>()
    for (const subscriber of subscribers) {
      const own = facts.get(subscriber.userId)
      if (own === undefined) continue
      dueByUser.set(subscriber.userId, dueReminders({ now, settings: subscriber.settings, facts: own }))
    }
    const candidates = subscribers.flatMap((subscriber) =>
      (dueByUser.get(subscriber.userId) ?? []).map((due) => ({ userId: subscriber.userId, due })),
    )
    const sentBefore = await loadSent(tx, candidates)

    const run: ReminderRun = { sent: 0, skipped: 0 }
    for (const subscriber of subscribers) {
      try {
        for (const due of dueByUser.get(subscriber.userId) ?? []) {
          if (sentBefore.has(keyOf(subscriber.userId, due.kind, due.ref, due.localDate))) {
            run.skipped += 1
            continue
          }
          // Claim first: the ledger row is what makes this run the only one that sends.
          const [claimed] = await tx<{ userId: string }[]>`
            insert into reminder_sent (user_id, kind, ref, local_date)
            values (${subscriber.userId}, ${due.kind}, ${due.ref}, ${due.localDate})
            on conflict do nothing
            returning user_id`
          if (claimed === undefined) {
            run.skipped += 1
            continue
          }
          await deliverToUser(tx, subscriber.userId, payloadOf(subscriber.locale, due), send)
          run.sent += 1
        }
      } catch (error) {
        // No endpoint and no mail address in the log: both name a device or a person.
        const name = error instanceof Error ? error.name : 'unknown'
        console.error(`reminder for user ${subscriber.userId} failed: ${name}`)
      }
    }
    return run
  })
}

/** Starts the minute loop the server runs; the first pass comes one interval after the start. */
export function startReminderJob(intervalMs = MINUTE_MS): () => void {
  const timer = setInterval(() => {
    void runReminders().catch((error: unknown) => {
      console.error('reminder job failed', error)
    })
  }, intervalMs)
  timer.unref()
  return () => clearInterval(timer)
}
