import nodemailer from 'nodemailer'
import { env } from './env.ts'

export type Mail = { to: string; subject: string; text: string }

const transport = env.SMTP_URL ? nodemailer.createTransport(env.SMTP_URL) : null
// In-memory outbox for development and tests only; GET /api/dev/mails reads it.
const captured: Mail[] = []

export async function sendMail(mail: Mail): Promise<void> {
  if (transport) {
    await transport.sendMail({ from: env.MAIL_FROM, ...mail })
    return
  }
  if (env.APP_MODE === 'development') {
    captured.push(mail)
    return
  }
  // Selfhost without SMTP: verification is off (auth.ts); resets go through cli.ts.
  console.warn(`mail not sent (no SMTP_URL): ${mail.subject}`)
}

export function devMails(): Mail[] {
  return [...captured]
}

export function clearDevMails(): void {
  captured.length = 0
}
