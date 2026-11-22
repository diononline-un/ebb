import { createFileRoute } from '@tanstack/react-router'
import { LowPage } from '../features/low/LowPage.tsx'

export const Route = createFileRoute('/low')({
  component: LowPage,
})
