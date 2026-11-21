import postgres from 'postgres'
import { dbPassword, dbUrl, env, type DbRole } from '../src/server/env.ts'
import { runMigrations } from './migrate.ts'

// Recreates the test database EBB_DB_NAME from scratch and migrates it. Refuses anything that is
// not a test database, because it drops the database first.
const database = env.EBB_DB_NAME
if (!database.startsWith('ebb_test')) {
  console.error(`Refusing to reset "${database}": EBB_DB_NAME must start with ebb_test`)
  process.exit(1)
}

const ROLE_ATTRIBUTES: Record<DbRole, string> = {
  owner: 'LOGIN',
  app: 'LOGIN NOBYPASSRLS',
  system: 'LOGIN BYPASSRLS',
  auth: 'LOGIN NOBYPASSRLS',
}

const quote = (value: string) => `'${value.replaceAll("'", "''")}'`

const admin = postgres(env.POSTGRES_SUPERUSER_URL, { max: 1, onnotice: () => {} })
try {
  for (const role of Object.keys(ROLE_ATTRIBUTES) as DbRole[]) {
    const name = `ebb_${role}`
    const [exists] = await admin`select 1 from pg_roles where rolname = ${name}`
    if (!exists) await admin.unsafe(`create role ${name} ${ROLE_ATTRIBUTES[role]} password ${quote(dbPassword(role))}`)
  }
  await admin.unsafe(`drop database if exists "${database}" with (force)`)
  await admin.unsafe(`create database "${database}" owner ebb_owner`)
} finally {
  await admin.end()
}

const owner = postgres(dbUrl('owner'), { max: 1, onnotice: () => {} })
try {
  const applied = await runMigrations(owner)
  console.log(`${database}: ${applied.length} migrations applied`)
} finally {
  await owner.end()
}
