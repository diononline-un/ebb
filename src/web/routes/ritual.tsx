import { createFileRoute } from '@tanstack/react-router'
import { RitualPage } from '../features/ritual/RitualPage.tsx'

export const Route = createFileRoute('/ritual')({
  component: RitualPage,
})
