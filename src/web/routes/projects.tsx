import { createFileRoute } from '@tanstack/react-router'
import { ProjectsPage } from '../features/projects/ProjectsPage.tsx'

export const Route = createFileRoute('/projects')({
  component: ProjectsPage,
})
