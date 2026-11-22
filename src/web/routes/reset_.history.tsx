import { createFileRoute } from '@tanstack/react-router'
import { History } from '../features/reset/History.tsx'

// reset_ keeps the history page out of the reset flow's layout: /reset/history is its own page.
export const Route = createFileRoute('/reset_/history')({
  component: History,
})
