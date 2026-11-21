import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import { X } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AuthError, type AuthErrorInfo } from '../features/auth/AuthError.tsx'
import { authClient } from '../lib/auth-client.ts'
import { Button } from '../ui/Button.tsx'
import { IconButton } from '../ui/IconButton.tsx'

export const Route = createFileRoute('/settings/security')({
  component: SecurityPage,
})

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })

function SecurityPage() {
  const { t } = useTranslation('auth')
  const router = useRouter()
  const [error, setError] = useState<AuthErrorInfo>(null)
  const [busy, setBusy] = useState(false)

  const passkeys = useQuery({
    queryKey: ['passkeys'],
    queryFn: async () => {
      const result = await authClient.passkey.listUserPasskeys()
      return result.data ?? []
    },
  })

  const sessions = useQuery({
    queryKey: ['sessions'],
    queryFn: async () => {
      const result = await authClient.listSessions()
      return result.data ?? []
    },
  })

  const addPasskey = async () => {
    setBusy(true)
    setError(null)
    const result = await authClient.passkey.addPasskey({ name: t('security.passkeyDefaultName') })
    setBusy(false)
    if (result.error) {
      setError(result.error)
      return
    }
    await passkeys.refetch()
  }

  const removePasskey = async (id: string) => {
    setError(null)
    const result = await authClient.passkey.deletePasskey({ id })
    if (result.error) {
      setError(result.error)
      return
    }
    await passkeys.refetch()
  }

  const signOutEverywhere = async () => {
    setBusy(true)
    setError(null)
    const result = await authClient.revokeSessions()
    setBusy(false)
    if (result.error) {
      setError(result.error)
      return
    }
    await router.navigate({ to: '/sign-in' })
  }

  return (
    <section className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <h1 className="text-title">{t('security.title')}</h1>
        <Link to="/today" className="text-small text-ink-2 underline hover:text-ink">
          {t('security.backToToday')}
        </Link>
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-heading">{t('security.passkeysTitle')}</h2>
        {(passkeys.data ?? []).length === 0 ? (
          <p className="text-small text-ink-2">{t('security.passkeysEmpty')}</p>
        ) : (
          <ul className="flex flex-col">
            {(passkeys.data ?? []).map((passkey) => {
              const name = passkey.name ?? t('security.passkeyDefaultName')
              const remove = () => {
                void removePasskey(passkey.id)
              }
              return (
                <li
                  key={passkey.id}
                  className="flex min-h-11 items-center justify-between gap-3 border-b border-line"
                >
                  <span className="text-body">{name}</span>
                  <IconButton label={t('security.removePasskey', { name })} onClick={remove}>
                    <X size={20} aria-hidden="true" />
                  </IconButton>
                </li>
              )
            })}
          </ul>
        )}
        <Button type="button" variant="secondary" disabled={busy} onClick={addPasskey}>
          {t('security.addPasskey')}
        </Button>
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-heading">{t('security.sessionsTitle')}</h2>
        <ul className="flex flex-col">
          {(sessions.data ?? []).map((session) => (
            <li key={session.id} className="flex min-h-11 items-center border-b border-line text-small text-ink-2">
              {t('security.sessionLine', { when: dateFormat.format(new Date(session.createdAt)) })}
            </li>
          ))}
        </ul>
        <AuthError error={error} />
        <p className="max-w-[65ch] text-small text-ink-2">{t('security.signOutText')}</p>
        <Button type="button" variant="danger" disabled={busy} onClick={signOutEverywhere}>
          {t('security.signOutEverywhere')}
        </Button>
      </div>
    </section>
  )
}
