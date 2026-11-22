import { createFileRoute } from '@tanstack/react-router'
import { GoalsPage } from '../features/goals/GoalsPage.tsx'

export const Route = createFileRoute('/goals')({
  component: GoalsPage,
})
