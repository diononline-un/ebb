import { createRootRoute, Outlet, redirect, useRouterState } from '@tanstack/react-router'
import { useEffect } from 'react'
import { AppShell } from '../features/shell/AppShell.tsx'
import { useMe } from '../features/onboarding/api.ts'
import { authClient } from '../lib/auth-client.ts'
import { router } from '../router.tsx'

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
  const publicPath = PUBLIC_PATHS.has(pathname)
  // The onboarding owns the first visit (PRD F2): until it is finished, every page leads to /welcome.
  const me = useMe(!publicPath)
  const onboarded = me.data?.settings.onboardingDoneAt ?? null

  useEffect(() => {
    if (publicPath || pathname === '/welcome' || me.data === undefined) return
    if (onboarded === null) void router.navigate({ to: '/welcome' })
  }, [publicPath, pathname, me.data, onboarded])


  if (!PUBLIC_PATHS.has(pathname)) {
    return (
      <AppShell>
        <Outlet />
      </AppShell>
    )
  }

  return <Outlet />
}
