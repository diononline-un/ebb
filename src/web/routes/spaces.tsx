import { createFileRoute } from '@tanstack/react-router'
import { SpacesPage } from '../features/spaces/SpacesPage.tsx'

export const Route = createFileRoute('/spaces')({
  component: SpacesPage,
})
