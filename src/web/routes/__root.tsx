import { createRootRoute, Outlet, redirect, useRouterState } from '@tanstack/react-router'
import { AppShell } from '../features/shell/AppShell.tsx'
import { authClient } from '../lib/auth-client.ts'

// Auth screens render without a session and without the navigation bar; everything else needs one.
const PUBLIC_PATHS = new Set(['/sign-in', '/sign-up', '/verify-email', '/forgot-password', '/reset-password'])

export const Route = createRootRoute({
  beforeLoad: async ({ location }) => {
    if (PUBLIC_PATHS.has(location.pathname)) return
    const session = await authClient.getSession()
    if (!session.data) throw redirect({ to: '/sign-in', search: { next: location.href } })
  },
  component: RootLayout,
})

function RootLayout() {
  const pathname = useRouterState({
    select: (state) => {
      return state.location.pathname
    },
  })

  if (!PUBLIC_PATHS.has(pathname)) {
    return (
      <AppShell>
        <Outlet />
      </AppShell>
    )
  }

  return <Outlet />
}
