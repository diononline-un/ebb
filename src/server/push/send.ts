import { sendNotification, WebPushError } from 'web-push'
import { env } from '../env.ts'

export type PushResult = 'ok' | 'gone' | 'error'
/** What pushManager.subscribe() hands back: the endpoint plus the two browser encryption keys. */
export type PushTarget = { endpoint: string; p256dh: string; auth: string }
/** The payload src/web/sw.ts reads. */
export type PushPayload = { title: string; body: string; url: string }

// In-memory outbox for development and tests only; GET /api/dev/pushes reads it. Same idea as mail.ts.
const captured: Array<PushPayload & { endpoint: string }> = []

// Push is off unless the deployment set all three values (E9-P1: VAPID keys come from the environment).
const vapid =
  env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY && env.VAPID_SUBJECT
    ? { publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY, subject: env.VAPID_SUBJECT }
    : null

/**
 * One message to one subscription. 404 and 410 mean the browser dropped it for good; every other
 * failure is 'error' and leaves the subscription in place for the next try.
 */
export async function sendPush(target: PushTarget, payload: PushPayload): Promise<PushResult> {
  if (!vapid) {
    if (env.APP_MODE === 'development') {
      captured.push({ endpoint: target.endpoint, ...payload })
      return 'ok'
    }
    console.warn('push not sent (no VAPID keys)')
    return 'error'
  }

  try {
    await sendNotification(
      { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
      JSON.stringify(payload),
      { TTL: 3600, vapidDetails: vapid },
    )
    return 'ok'
  } catch (error) {
    const status = error instanceof WebPushError ? error.statusCode : 0
    if (status === 404 || status === 410) return 'gone'
    // No endpoint in the log: it names the browser of a person.
    console.warn(`push failed: ${status || (error as Error).message}`)
    return 'error'
  }
}

export function devPushes(): Array<PushPayload & { endpoint: string }> {
  return [...captured]
}

export function clearDevPushes(): void {
  captured.length = 0
}
