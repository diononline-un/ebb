// E9-P1: the browser side of web push. The permission prompt may only be triggered by a click, so
// nothing here runs on load and the settings UI (E9-P3) will call subscribePush() from a button.

/** Service worker, PushManager and Notification must all exist, otherwise the browser cannot push. */
export function pushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

/**
 * Asks for the public key, the permission and a subscription, then hands it to the server.
 * False means push stays off: no keys on the server, permission denied, or the server refused.
 * Call this from a click handler.
 */
export async function subscribePush(): Promise<boolean> {
  if (!pushSupported()) return false

  const response = await fetch('/api/push/key')
  if (!response.ok) return false
  const { publicKey } = (await response.json()) as { publicKey: string | null }
  if (!publicKey) return false

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return false

  const registration = await navigator.serviceWorker.ready
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: base64UrlToBytes(publicKey),
  })

  const stored = await fetch('/api/push/subscriptions', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(subscription.toJSON()),
  })
  return stored.ok
}

/** Unsubscribes on the server first, so a failed browser step cannot leave a row that pushes nowhere. */
export async function unsubscribePush(): Promise<void> {
  if (!pushSupported()) return

  const registration = await navigator.serviceWorker.ready
  const subscription = await registration.pushManager.getSubscription()
  if (!subscription) return

  await fetch('/api/push/subscriptions', {
    method: 'DELETE',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ endpoint: subscription.endpoint }),
  })
  await subscription.unsubscribe()
}

/** The VAPID key is URL-safe base64 without padding; PushManager wants the raw bytes. */
function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=')
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return bytes
}
