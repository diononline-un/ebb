import { passkeyClient } from '@better-auth/passkey/client'
import { createAuthClient } from 'better-auth/react'

// Same origin as the app: Vite proxies /api to the server in development, the Node server serves both
// in production, so cookies stay first-party.
export const authClient = createAuthClient({
  basePath: '/api/auth',
  plugins: [passkeyClient()],
})
