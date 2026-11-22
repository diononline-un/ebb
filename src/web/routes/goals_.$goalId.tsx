import { createFileRoute } from '@tanstack/react-router'
import { GoalPage } from '../features/goals/GoalPage.tsx'

// goals_ keeps the detail page out of the list's layout: /goals/$goalId is its own page.
export const Route = createFileRoute('/goals_/$goalId')({
  component: GoalPage,
})
