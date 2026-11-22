import { createFileRoute } from '@tanstack/react-router'
import { PlanPage } from '../features/plan/PlanPage.tsx'

export const Route = createFileRoute('/plan')({
  component: PlanPage,
})
