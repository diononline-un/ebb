import { z } from 'zod'
import { APP_NAME } from '../shared/brand.ts'

// The only module that reads process.env. Development gets working defaults; deployed modes
// (production, selfhost) must set every secret explicitly and fail fast otherwise.
const raw = process.env
const deployed = raw['APP_MODE'] === 'production' || raw['APP_MODE'] === 'selfhost'

const secret = deployed ? z.string().min(12) : z.string().min(1).default('ebb_dev')

const schema = z.object({
  APP_MODE: z.enum(['development', 'production', 'selfhost']).default('development'),
  NODE_ENV: z.string().default('development'),
  APP_URL: deployed ? z.url() : z.url().default('http://localhost:2042'),
  PORT: z.coerce.number().int().positive().default(2040),
  PGHOST: z.string().default('127.0.0.1'),
  PGPORT: z.coerce.number().int().positive().default(2041),
  EBB_DB_NAME: z.string().regex(/^[a-z][a-z0-9_]*$/).default('ebb'),
  EBB_OWNER_PASSWORD: secret,
  EBB_APP_PASSWORD: secret,
  EBB_SYSTEM_PASSWORD: secret,
  EBB_AUTH_PASSWORD: secret,
  // Only scripts/test-setup.ts uses it, to create test databases and missing roles.
  POSTGRES_SUPERUSER_URL: z.string().default('postgres://postgres:ebb_dev@127.0.0.1:2041/postgres'),
  // Signs session cookies and tokens (Better Auth).
  AUTH_SECRET: deployed ? z.string().min(32) : z.string().default('development-only-secret-do-not-deploy-0000'),
  // Without SMTP: development captures mails (GET /api/dev/mails), selfhost skips verification.
  SMTP_URL: z.string().optional(),
  MAIL_FROM: z.string().default(`${APP_NAME} <no-reply@localhost>`),
  // Billing (E8): without a webhook secret the route answers 503, so development needs no Paddle.
  PADDLE_WEBHOOK_SECRET: z.string().optional(),
  PADDLE_API_KEY: z.string().optional(),
  PADDLE_PRICE_FOUNDER: z.string().optional(),
  PADDLE_PRICE_STANDARD: z.string().optional(),
  PADDLE_PRICE_SEAT: z.string().optional(),
  PRICE_BASE_ACTIVE: z.enum(['founder', 'standard']).default('founder'),
  TRIAL_REQUIRES_CARD: z.enum(['true', 'false']).default('false'),
  MAX_EXTRA_SEATS: z.coerce.number().int().min(0).max(20).default(5),
})

const parsed = schema
  .refine((value) => value.APP_MODE !== 'production' || Boolean(value.SMTP_URL), { path: ['SMTP_URL'] })
  .safeParse(raw)
if (!parsed.success) {
  const fields = parsed.error.issues.map((issue) => issue.path.join('.')).join(', ')
  throw new Error(`Invalid or missing environment variables: ${fields}`)
}

export const env = parsed.data

export type DbRole = 'owner' | 'app' | 'system' | 'auth'

const passwords: Record<DbRole, string> = {
  owner: env.EBB_OWNER_PASSWORD,
  app: env.EBB_APP_PASSWORD,
  system: env.EBB_SYSTEM_PASSWORD,
  auth: env.EBB_AUTH_PASSWORD,
}

export function dbUrl(role: DbRole, database: string = env.EBB_DB_NAME): string {
  const password = encodeURIComponent(passwords[role])
  return `postgres://ebb_${role}:${password}@${env.PGHOST}:${env.PGPORT}/${database}`
}

export function dbPassword(role: DbRole): string {
  return passwords[role]
}
