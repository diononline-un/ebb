import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import postgres, { type Sql } from 'postgres'
import { dbUrl } from '../src/server/env.ts'

const MIGRATIONS_DIR = join(import.meta.dirname, '..', 'migrations')

/** Applies every migrations/NNNN_*.sql not yet recorded, in name order, one transaction per file. */
export async function runMigrations(sql: Sql): Promise<string[]> {
  await sql`
    create table if not exists schema_migrations (
      name text primary key,
      applied_at timestamptz not null default now()
    )`
  const done = new Set((await sql<{ name: string }[]>`select name from schema_migrations`).map((row) => row.name))
  const files = (await readdir(MIGRATIONS_DIR)).filter((file) => /^\d{4}_[a-z0-9_]+\.sql$/.test(file)).sort()
  const applied: string[] = []

  for (const file of files) {
    if (done.has(file)) continue
    const body = await readFile(join(MIGRATIONS_DIR, file), 'utf8')
    try {
      await sql.begin(async (tx) => {
        await tx.unsafe(body)
        await tx`insert into schema_migrations (name) values (${file})`
      })
    } catch (error) {
      throw new Error(`Migration ${file} failed: ${(error as Error).message}`, { cause: error })
    }
    applied.push(file)
  }
  return applied
}

if (import.meta.main) {
  const sql = postgres(dbUrl('owner'), { max: 1, onnotice: () => {} })
  try {
    const applied = await runMigrations(sql)
    console.log(applied.length ? `applied: ${applied.join(', ')}` : 'up to date')
  } catch (error) {
    console.error((error as Error).message)
    process.exitCode = 1
  } finally {
    await sql.end()
  }
}
