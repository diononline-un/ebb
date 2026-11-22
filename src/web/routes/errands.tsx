import { createFileRoute } from '@tanstack/react-router'
import { ErrandsPage } from '../features/errands/ErrandsPage.tsx'

export const Route = createFileRoute('/errands')({
  component: ErrandsPage,
})
