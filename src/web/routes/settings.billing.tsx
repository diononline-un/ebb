import { createFileRoute, Navigate } from '@tanstack/react-router'
import { BillingPage } from '../features/billing/BillingPage.tsx'
import { useMe } from '../features/onboarding/api.ts'

export const Route = createFileRoute('/settings/billing')({
  component: BillingRoute,
})

/** Self-host has no billing (E8-P7): whoever lands here goes back to More, as the entry is gone. */
function BillingRoute() {
  const me = useMe()
  // The root layout reads the same query, so this is the answer that is already there.
  if (!me.data) return null
  if (me.data.access.selfhost) return <Navigate to="/more" replace />
  return <BillingPage />
}
