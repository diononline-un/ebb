import { getMigrations } from 'better-auth/db/migration'
import { auth } from '../src/server/auth.ts'

// Prints the SQL Better Auth needs, compared against the database EBB_DB_NAME points to.
// Used to write migrations/0002_auth.sql against a fresh test database; rerun after upgrading
// Better Auth or adding an auth plugin, then add the difference as a new migration.
const { compileMigrations } = await getMigrations(auth.options)
console.log(await compileMigrations())
process.exit(0)
