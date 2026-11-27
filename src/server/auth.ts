import { passkey } from '@better-auth/passkey'
import { APIError, betterAuth } from 'better-auth'
import { createAuthMiddleware } from 'better-auth/api'
import pg from 'pg'
import { APP_NAME } from '../shared/brand.ts'
import { bootstrapUser } from './domain/users/bootstrap.ts'
import { dbUrl, env } from './env.ts'
import { sendMail } from './mail.ts'

// Own pool as ebb_auth: the only role that can read password hashes and sessions (docs/architektur.md).
const pool = new pg.Pool({ connectionString: dbUrl('auth'), max: 5 })

// Selfhost without SMTP cannot deliver verification mails, so it signs people in without them.
export const verifyEmail = !(env.APP_MODE === 'selfhost' && !env.SMTP_URL)

// Set only by cli.ts inside its own process: with REGISTRATION=closed the operator still creates
// accounts. Nothing reachable over HTTP can set it.
let allowNextSignup = false

/** Lets the next account creation through the closed-registration gate. Only cli.ts calls this. */
export function allowSignupFromCli(): void {
  allowNextSignup = true
}

/**
 * Registration gate (E8-P7): `open` takes everyone, `closed` the very first account and whatever
 * the CLI creates in its own process.
 */
export function registrationAllowed(mode: 'open' | 'closed', userCount: number, viaCli: boolean): boolean {
  if (mode === 'open') return true
  return viaCli || userCount === 0
}

export const auth = betterAuth({
  appName: APP_NAME,
  baseURL: env.APP_URL,
  basePath: '/api/auth',
  secret: env.AUTH_SECRET,
  database: pool,
  trustedOrigins: [env.APP_URL],
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 10,
    requireEmailVerification: verifyEmail,
    sendResetPassword: async ({ user, url }) => {
      await sendMail({
        to: user.email,
        subject: `Reset your ${APP_NAME} password`,
        text: `Someone asked to reset the password for this account.\n\nSet a new one here: ${url}\n\nIf that was not you, ignore this mail. Nothing changes.`,
      })
    },
  },
  emailVerification: {
    sendOnSignUp: verifyEmail,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      await sendMail({
        to: user.email,
        subject: `Confirm your email for ${APP_NAME}`,
        text: `Confirm your email to start planning: ${url}\n\nIf you did not sign up, ignore this mail.`,
      })
    },
  },
  rateLimit: {
    enabled: true,
    storage: 'database',
    window: 60,
    max: 100,
    customRules: {
      '/sign-in/email': { window: 60, max: 10 },
      '/sign-up/email': { window: 60, max: 5 },
      '/request-password-reset': { window: 60, max: 3 },
    },
  },
  advanced: {
    useSecureCookies: env.APP_MODE !== 'development',
    // Caddy replaces client-sent X-Forwarded-For, so the first entry is the real client (docs/architektur.md).
    ipAddress: { ipAddressHeaders: ['x-forwarded-for'] },
  },
  plugins: [passkey({ rpID: new URL(env.APP_URL).hostname, rpName: APP_NAME, origin: env.APP_URL })],
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          await bootstrapUser(user.id)
        },
      },
    },
  },
  hooks: {
    // Registration gate (E8-P7). It lives in hooks.before and not in databaseHooks.user.create.before
    // because Better Auth answers every 403 from user creation with a generic 200 duplicate response
    // while email verification is on: the refusal and its code would never reach the client.
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== '/sign-up/email') return
      const viaCli = allowNextSignup
      allowNextSignup = false
      // Counted over Better Auth's own pool (ebb_auth): the request role cannot read the auth
      // tables, so this is neither withSystem nor SQL of our own.
      const userCount = await ctx.context.internalAdapter.countTotalUsers()
      if (!registrationAllowed(env.REGISTRATION, userCount, viaCli)) {
        throw new APIError('FORBIDDEN', { message: 'Registration is closed', code: 'registration_closed' })
      }
    }),
  },
})
