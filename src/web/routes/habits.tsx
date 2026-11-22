import { createFileRoute } from '@tanstack/react-router'
import { HabitsPage } from '../features/habits/HabitsPage.tsx'

export const Route = createFileRoute('/habits')({
  component: HabitsPage,
})
