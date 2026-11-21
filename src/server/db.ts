import postgres, { type TransactionSql } from 'postgres'
import { dbUrl } from './env.ts'

// Rows come back camelCase (postgres.camel); SQL text stays snake_case.
const options = { max: 10, onnotice: () => {}, transform: postgres.camel } as const

/** Request role: no BYPASSRLS. Only ever used through withUser(). */
const appSql = postgres(dbUrl('app'), options)
/** System role: BYPASSRLS. Allowed only in jobs, the billing webhook, auth hooks and cli.ts (AGENTS.md). */
const systemSql = postgres(dbUrl('system'), { ...options, max: 5 })

export type Tx = TransactionSql

/**
 * Runs fn in a transaction as ebb_app with app.uid() = userId. Every query in the request path
 * goes through here; RLS policies read app.uid(). The setting is transaction-local.
 */
export async function withUser<T>(userId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  if (!userId) throw new Error('withUser needs a user id')
  return (await appSql.begin(async (tx) => {
    await tx`select set_config('app.user_id', ${userId}, true)`
    return fn(tx)
  })) as T
}

/** Runs fn in a transaction as ebb_system, bypassing RLS. Every caller states why in a comment. */
export async function withSystem<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return (await systemSql.begin(fn)) as T
}

/** Unscoped request-role query, for tests that prove what the role can and cannot do. */
export function appRoleSqlForTests(): typeof appSql {
  return appSql
}

export async function closeDb(): Promise<void> {
  await Promise.all([appSql.end(), systemSql.end()])
}
