import { createHandlerBoundToURL, precacheAndRoute, type PrecacheEntry } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'

// The web build carries the DOM lib, not the worker lib, so the few service worker globals used here
// are declared by shape. __WB_MANIFEST is injected by vite-plugin-pwa at build time (injectManifest).
type PushEvent = { data: { json(): unknown } | null; waitUntil(promise: Promise<unknown>): void }
type NotificationEvent = {
  notification: { data: unknown; close(): void }
  waitUntil(promise: Promise<unknown>): void
}
type AppWindow = { navigate(url: string): Promise<unknown>; focus(): Promise<unknown> }

declare const self: {
  __WB_MANIFEST: Array<PrecacheEntry | string>
  addEventListener(type: 'push', listener: (event: PushEvent) => void): void
  addEventListener(type: 'notificationclick', listener: (event: NotificationEvent) => void): void
  registration: { showNotification(title: string, options: NotificationOptions): Promise<void> }
  clients: {
    matchAll(options: { type: 'window'; includeUncontrolled: boolean }): Promise<AppWindow[]>
    openWindow(url: string): Promise<unknown>
  }
}

precacheAndRoute(self.__WB_MANIFEST)

// Offline navigations get the app shell. API responses are never cached (offline data lives in E2-P6).
registerRoute(
  new NavigationRoute(createHandlerBoundToURL('index.html'), {
    denylist: [/^\/api\//],
  }),
)

// The payload comes from src/server/push/send.ts: { title, body, url }.
self.addEventListener('push', (event) => {
  const message = (event.data?.json() ?? {}) as { title?: string; body?: string; url?: string }
  event.waitUntil(
    self.registration.showNotification(message.title ?? '', {
      body: message.body ?? '',
      data: { url: message.url ?? '/today' },
      icon: '/icons/icon.svg',
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  // Only a path of this app is opened; anything else lands on today.
  const url = targetUrl(event.notification.data)
  event.waitUntil(focusOrOpen(url))
})

function targetUrl(data: unknown): string {
  const url = (data as { url?: unknown } | null)?.url
  return typeof url === 'string' && url.startsWith('/') && !url.startsWith('//') ? url : '/today'
}

/** An open window of the app is focused and navigated; without one the URL opens in a new tab. */
async function focusOrOpen(url: string): Promise<void> {
  const [open] = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
  if (open) {
    await open.navigate(url)
    await open.focus()
    return
  }
  await self.clients.openWindow(url)
}
