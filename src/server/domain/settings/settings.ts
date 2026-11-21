import type { Notify, SettingsPatch } from '../../../shared/schemas/settings.ts'
import type { Tx } from '../../db.ts'

export type Settings = {
  locale: string
  timezone: string
  dayStartMinute: number
  lastDayStarted: string | null
  morningReminder: string | null
  weeklyResetDow: number
  weeklyResetTime: string
  errandsDow: number | null
  quietStart: string
  quietEnd: string
  mustWarnAt: number
  timerDefaultMin: number
  notify: Notify
  onboardingStep: number
  onboardingDoneAt: Date | null
  updatedAt: Date
}

const COLUMNS = `locale, timezone, day_start_minute, last_day_started, morning_reminder,
  weekly_reset_dow, weekly_reset_time, errands_dow, quiet_start, quiet_end, must_warn_at,
  timer_default_min, notify, onboarding_step, onboarding_done_at, updated_at`

// Patch key -> column. The list is closed: anything else in the body is dropped by the schema.
const PATCHABLE = [
  ['locale', 'locale'],
  ['timezone', 'timezone'],
  ['dayStartMinute', 'day_start_minute'],
  ['morningReminder', 'morning_reminder'],
  ['weeklyResetDow', 'weekly_reset_dow'],
  ['weeklyResetTime', 'weekly_reset_time'],
  ['errandsDow', 'errands_dow'],
  ['quietStart', 'quiet_start'],
  ['quietEnd', 'quiet_end'],
  ['mustWarnAt', 'must_warn_at'],
  ['timerDefaultMin', 'timer_default_min'],
] as const

/** Postgres hands back `time` as HH:MM:SS; the API speaks HH:MM in both directions. */
function toHhMm(value: string | null): string | null {
  return value === null ? null : value.slice(0, 5)
}

function toSettings(row: Settings): Settings {
  return {
    ...row,
    morningReminder: toHhMm(row.morningReminder),
    weeklyResetTime: row.weeklyResetTime.slice(0, 5),
    quietStart: row.quietStart.slice(0, 5),
    quietEnd: row.quietEnd.slice(0, 5),
  }
}

/** The signed-in user's row. Runs inside withUser, so the RLS policy resolves app.uid(). */
export async function getSettings(tx: Tx): Promise<Settings> {
  const [row] = await tx.unsafe<Settings[]>(`select ${COLUMNS} from user_settings where user_id = app.uid()`)
  if (!row) throw new Error('missing user_settings row')
  return toSettings(row)
}

export async function patchSettings(tx: Tx, patch: SettingsPatch): Promise<Settings> {
  const assignments: string[] = []
  const values: (string | number | null)[] = []

  for (const [key, column] of PATCHABLE) {
    if (!(key in patch)) continue
    const value = patch[key]
    if (value === undefined) continue
    values.push(value)
    assignments.push(`${column} = $${values.length}`)
  }

  if (patch.notify) {
    // Merge, so a single switch does not wipe the others.
    values.push(JSON.stringify(patch.notify))
    // ::text::jsonb on purpose: postgres.js sends text, and a bare ::jsonb cast double-encodes it.
    assignments.push(`notify = notify || $${values.length}::text::jsonb`)
  }

  if (assignments.length === 0) return getSettings(tx)

  const [row] = await tx.unsafe<Settings[]>(
    `update user_settings set ${assignments.join(', ')}, updated_at = now()
     where user_id = app.uid()
     returning ${COLUMNS}`,
    values,
  )
  if (!row) throw new Error('missing user_settings row')
  return toSettings(row)
}
