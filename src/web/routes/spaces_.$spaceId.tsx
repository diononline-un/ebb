import { createFileRoute } from '@tanstack/react-router'
import { SpacePage } from '../features/spaces/SpacePage.tsx'

// spaces_ keeps the space page out of the list's layout: /spaces/$spaceId is its own page.
export const Route = createFileRoute('/spaces_/$spaceId')({
  component: SpaceRoute,
})

function SpaceRoute() {
  const { spaceId } = Route.useParams()
  return <SpacePage spaceId={spaceId} />
}
