import { passkey } from '@better-auth/passkey'
import { betterAuth } from 'better-auth'
import pg from 'pg'
import { bootstrapUser } from './domain/users/bootstrap.ts'
import { dbUrl, env } from './env.ts'
import { sendMail } from './mail.ts'

// Own pool as ebb_auth: the only role that can read password hashes and sessions (docs/architektur.md).
const pool = new pg.Pool({ connectionString: dbUrl('auth'), max: 5 })

// Selfhost without SMTP cannot deliver verification mails, so it signs people in without them.
const verifyEmail = !(env.APP_MODE === 'selfhost' && !env.SMTP_URL)

export const auth = betterAuth({
  appName: 'Ebb',
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
        subject: 'Reset your Ebb password',
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
        subject: 'Confirm your email for Ebb',
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
      // The dev server runs without a proxy, so Better Auth finds no client IP and puts every request
      // in one bucket; the e2e suite signs up once per spec and would trip the production limit.
      // Production and selfhost keep five.
      '/sign-up/email': { window: 60, max: env.APP_MODE === 'development' ? 50 : 5 },
      '/request-password-reset': { window: 60, max: 3 },
    },
  },
  advanced: {
    useSecureCookies: env.APP_MODE !== 'development',
    // Caddy replaces client-sent X-Forwarded-For, so the first entry is the real client (docs/architektur.md).
    ipAddress: { ipAddressHeaders: ['x-forwarded-for'] },
  },
  plugins: [passkey({ rpID: new URL(env.APP_URL).hostname, rpName: 'Ebb', origin: env.APP_URL })],
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          await bootstrapUser(user.id)
        },
      },
    },
  },
})
