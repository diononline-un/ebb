import { createFileRoute, redirect } from '@tanstack/react-router'
import { lazy, Suspense } from 'react'
import { authClient } from '../lib/auth-client.ts'

// The landing page is its own chunk: a signed-in person who lands on /today never downloads it, and
// the entry chunk keeps room for the app.
const LandingPage = lazy(() =>
  import('../features/landing/LandingPage.tsx').then((module) => ({ default: module.LandingPage })),
)

export const Route = createFileRoute('/')({
  beforeLoad: async () => {
    const session = await authClient.getSession()
    if (session.data) throw redirect({ to: '/today' })
  },
  component: IndexPage,
})

function IndexPage() {
  return (
    <Suspense fallback={null}>
      <LandingPage />
    </Suspense>
  )
}
