import { createFileRoute } from '@tanstack/react-router'
import { ResetPage } from '../features/reset/ResetPage.tsx'

export const Route = createFileRoute('/reset')({
  component: ResetPage,
})
