import { createHmac, timingSafeEqual } from 'node:crypto'

// Paddle signs every webhook with `Paddle-Signature: ts=<unix>;h1=<hmac>` over `<ts>:<raw body>`
// (https://developer.paddle.com/webhooks/signature-verification). Nothing else is trusted.

/** Five minutes, as the Paddle documentation asks; an older timestamp is treated as a replay. */
export const SIGNATURE_TOLERANCE_SECONDS = 5 * 60

export type SignatureCheck = { ok: true } | { ok: false; reason: 'missing' | 'malformed' | 'stale' | 'mismatch' }

export function signatureOf(secret: string, timestamp: string, body: string): string {
  return createHmac('sha256', secret).update(`${timestamp}:${body}`).digest('hex')
}

/**
 * Checks the header against the raw body. `now` comes in as seconds so the caller decides the clock
 * (tests use a fixed one); a missing or broken header never passes.
 */
export function verifySignature(
  secret: string,
  header: string | null | undefined,
  body: string,
  nowSeconds: number,
): SignatureCheck {
  if (!header) return { ok: false, reason: 'missing' }

  const parts = new Map<string, string>()
  for (const piece of header.split(';')) {
    const [key, value] = piece.split('=')
    if (key && value) parts.set(key.trim(), value.trim())
  }
  const timestamp = parts.get('ts')
  const signature = parts.get('h1')
  if (!timestamp || !signature || !/^\d+$/.test(timestamp)) return { ok: false, reason: 'malformed' }

  if (Math.abs(nowSeconds - Number(timestamp)) > SIGNATURE_TOLERANCE_SECONDS) return { ok: false, reason: 'stale' }

  const expected = signatureOf(secret, timestamp, body)
  const given = Buffer.from(signature, 'hex')
  const wanted = Buffer.from(expected, 'hex')
  if (given.length !== wanted.length) return { ok: false, reason: 'mismatch' }
  if (!timingSafeEqual(given, wanted)) return { ok: false, reason: 'mismatch' }
  return { ok: true }
}
