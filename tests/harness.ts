import postgres from 'postgres'
import { dbUrl, env } from '../src/server/env.ts'

// Owner connection for test setup only (truncate, inspect roles). Never import this from src/.
export const ownerSql = postgres(dbUrl('owner'), { max: 2, onnotice: () => {}, transform: postgres.camel })

/** Empties every app table. Refuses to run against anything but a test database. */
export async function resetDb(): Promise<void> {
  if (!env.EBB_DB_NAME.startsWith('ebb_test')) {
    throw new Error(`resetDb refuses to truncate "${env.EBB_DB_NAME}"`)
  }
  const tables = await ownerSql<{ tablename: string }[]>`
    select tablename from pg_tables where schemaname = 'public' and tablename <> 'schema_migrations'`
  if (tables.length === 0) return
  const list = tables.map((table) => `public."${table.tablename}"`).join(', ')
  await ownerSql.unsafe(`truncate ${list} restart identity cascade`)
}
