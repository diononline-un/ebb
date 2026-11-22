import { createFileRoute } from '@tanstack/react-router'
import { TodayPage } from '../features/today/TodayPage.tsx'

export const Route = createFileRoute('/today')({
  component: TodayPage,
})
