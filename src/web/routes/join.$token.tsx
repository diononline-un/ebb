import { createFileRoute, Link } from '@tanstack/react-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ApiError } from '../lib/api.ts'
import { Button } from '../ui/Button.tsx'
import { useJoinSpace, useSpaces } from '../features/spaces/api.ts'

export const Route = createFileRoute('/join/$token')({
  component: JoinPage,
})

/**
 * The invitation link. It loads nothing before the person says yes: the token alone decides, and
 * only after joining does the page ask for the space behind it.
 */
function JoinPage() {
  const { token } = Route.useParams()
  const { t } = useTranslation('spaces')
  const join = useJoinSpace()
  const [joined, setJoined] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const spaces = useSpaces(joined !== null)
  const space = spaces.data?.find((entry) => entry.id === joined) ?? null

  const take = async () => {
    setError(null)
    try {
      const answer = await join.mutateAsync(token)
      setJoined(answer.spaceId)
    } catch (failure) {
      const code = failure instanceof ApiError ? failure.code : 'generic'
      setError(t(`errors.${code}`, { defaultValue: t('errors.generic') }))
    }
  }

  if (joined) {
    return (
      <section className="flex flex-col gap-8">
        <h1 className="text-title">{t('join.title')}</h1>
        <p className="max-w-[65ch] text-body text-ink-2">
          {space ? t('join.joined', { name: space.name }) : t('join.hint')}
        </p>
        <Link
          to="/spaces/$spaceId"
          params={{ spaceId: joined }}
          className="text-body text-ink underline hover:text-ink-2"
        >
          {space ? t('join.open', { name: space.name }) : t('join.openFallback')}
        </Link>
      </section>
    )
  }

  return (
    <section className="flex flex-col gap-8">
      <h1 className="text-title">{t('join.title')}</h1>
      <p className="max-w-[65ch] text-body text-ink-2">{t('join.hint')}</p>
      <Button type="button" onClick={() => void take()}>
        {t('join.action')}
      </Button>
      {error ? (
        <p role="alert" className="text-small text-danger">
          {error}
        </p>
      ) : null}
    </section>
  )
}
