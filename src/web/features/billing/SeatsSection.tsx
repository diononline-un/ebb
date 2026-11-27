import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ApiError, apiFetch } from '../../lib/api.ts'
import { Button } from '../../ui/Button.tsx'

// E8-P5: the seat list of GET /api/billing/seats (E8-P6). The page reads what Paddle confirmed plus
// the wishes that still wait for the webhook, so a cover shows up as pending instead of vanishing.

export type Seat = { userId: string; name: string }

export type SeatRequest = { userId: string; action: 'cover' | 'release' }

export type SeatOverview = {
  subscriptionId: string | null
  covered: Seat[]
  pending: SeatRequest[]
  candidates: Seat[]
  max: number
}

const SEATS_KEY = ['seats'] as const

type SeatChange = { action: 'cover' | 'release'; userId: string }

/** Only a paying person has seats; the billing page decides whether this section appears at all. */
export function SeatsSection() {
  const { t } = useTranslation('billing')
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)
  const seats = useQuery({ queryKey: SEATS_KEY, queryFn: () => apiFetch<SeatOverview>('/api/billing/seats') })

  const change = useMutation({
    mutationFn: ({ action, userId }: SeatChange) =>
      apiFetch<void>(`/api/billing/seats/${action}`, { method: 'POST', body: JSON.stringify({ memberId: userId }) }),
    // The wish only reaches Paddle here; the confirmed seat follows with the webhook.
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: SEATS_KEY })
    },
  })

  const run = async (action: SeatChange['action'], userId: string) => {
    setError(null)
    try {
      await change.mutateAsync({ action, userId })
    } catch (cause) {
      const code = cause instanceof ApiError ? cause.code : 'generic'
      setError(t(`seats.errors.${code}`, { defaultValue: t('seats.errors.generic') }))
    }
  }

  const data = seats.data
  // Loading and a failed read keep the page quiet; the rest of the subscription page still stands.
  if (!data) return null

  // A release that Paddle has not confirmed keeps the person covered, so their row says "pending"
  // instead of offering the button a second time. A pending cover has no name yet: the candidates
  // list drops the person as soon as the wish is recorded.
  const pendingReleases = new Set(
    data.pending.filter((request) => request.action === 'release').map((request) => request.userId),
  )
  const unknownPending = data.pending.filter((request) => request.action === 'cover')

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-heading">{t('seats.heading')}</h2>
      <p className="max-w-[65ch] text-small text-ink-2">{t('seats.limit', { max: data.max })}</p>

      <ul className="flex flex-col">
        {data.covered.map((seat) => (
          <li key={seat.userId} className="flex min-h-11 items-center justify-between gap-3 border-b border-line">
            <span className="text-body">{seat.name}</span>
            {pendingReleases.has(seat.userId) ? (
              <span className="text-small text-ink-3">{t('seats.pending')}</span>
            ) : (
              <Button
                type="button"
                variant="ghost"
                disabled={change.isPending}
                onClick={() => void run('release', seat.userId)}
              >
                {t('seats.release')}
              </Button>
            )}
          </li>
        ))}
        {unknownPending.map((request) => (
          <li key={request.userId} className="flex min-h-11 items-center border-b border-line text-small text-ink-3">
            {t('seats.pending')}
          </li>
        ))}
      </ul>

      {data.candidates.length === 0 ? (
        <p className="max-w-[65ch] text-small text-ink-2">{t('seats.empty')}</p>
      ) : (
        <>
          <h3 className="text-body font-medium">{t('seats.candidatesHeading')}</h3>
          <ul className="flex flex-col">
            {data.candidates.map((seat) => (
              <li key={seat.userId} className="flex min-h-11 items-center justify-between gap-3 border-b border-line">
                <span className="text-body">{seat.name}</span>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={change.isPending}
                  onClick={() => void run('cover', seat.userId)}
                >
                  {t('seats.cover')}
                </Button>
              </li>
            ))}
          </ul>
        </>
      )}

      {error ? (
        <p role="alert" className="max-w-[65ch] text-small text-danger">
          {error}
        </p>
      ) : null}
    </div>
  )
}
