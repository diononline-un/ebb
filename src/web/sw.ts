import { createHandlerBoundToURL, precacheAndRoute, type PrecacheEntry } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'

// Injected by vite-plugin-pwa at build time (injectManifest strategy).
declare const self: { __WB_MANIFEST: Array<PrecacheEntry | string> }

precacheAndRoute(self.__WB_MANIFEST)

// Offline navigations get the app shell. API responses are never cached (offline data lives in E2-P6).
registerRoute(
  new NavigationRoute(createHandlerBoundToURL('index.html'), {
    denylist: [/^\/api\//],
  }),
)
