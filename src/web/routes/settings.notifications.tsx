import { createFileRoute } from '@tanstack/react-router'
import { NotificationsPage } from '../features/settings/NotificationsPage.tsx'

export const Route = createFileRoute('/settings/notifications')({
  component: NotificationsPage,
})
