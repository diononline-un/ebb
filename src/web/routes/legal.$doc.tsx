import { createFileRoute, notFound } from '@tanstack/react-router'
import { isLegalDoc, LegalPage } from '../features/legal/LegalPage.tsx'

export const Route = createFileRoute('/legal/$doc')({
  beforeLoad: ({ params }) => {
    if (!isLegalDoc(params.doc)) throw notFound()
  },
  component: LegalRoute,
})

function LegalRoute() {
  const { doc } = Route.useParams()
  return isLegalDoc(doc) ? <LegalPage doc={doc} /> : null
}
