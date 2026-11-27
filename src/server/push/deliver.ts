import type { Tx } from '../db.ts'
import { sendPush, type PushPayload, type PushResult, type PushTarget } from './send.ts'

export type Delivery = { sent: number; removed: number }

/**
 * Sends one message to every subscription of a person. The caller is the send_push job and therefore
 * already runs in withSystem (docs/architektur.md); this file opens no transaction of its own and no
 * withSystem, because it must stay usable from the job only.
 *
 * 'gone' means the browser dropped the subscription for good, so its row goes with it.
 */
export async function deliverToUser(
  tx: Tx,
  userId: string,
  payload: PushPayload,
  send: (target: PushTarget, payload: PushPayload) => Promise<PushResult> = sendPush,
): Promise<Delivery> {
  const subscriptions = await tx<{ id: string; endpoint: string; p256dh: string; auth: string }[]>`
    select id, endpoint, p256dh, auth from push_subscription where user_id = ${userId}`

  let sent = 0
  let removed = 0
  for (const subscription of subscriptions) {
    const result = await send(
      { endpoint: subscription.endpoint, p256dh: subscription.p256dh, auth: subscription.auth },
      payload,
    )
    if (result === 'gone') {
      await tx`delete from push_subscription where id = ${subscription.id}`
      removed += 1
    } else if (result === 'ok') {
      await tx`update push_subscription set last_success_at = now() where id = ${subscription.id}`
      sent += 1
    }
  }
  return { sent, removed }
}
