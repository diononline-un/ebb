import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import { useState, type ChangeEvent, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { AuthError, type AuthErrorInfo } from '../features/auth/AuthError.tsx'
import { AuthField } from '../features/auth/AuthField.tsx'
import { AuthFrame } from '../features/auth/AuthFrame.tsx'
import { authClient } from '../lib/auth-client.ts'
import { Button } from '../ui/Button.tsx'

export const Route = createFileRoute('/reset-password')({
  // The reset mail redirect lands here with the one-time token.
  validateSearch: (search: Record<string, unknown>): { token?: string } => {
    const token = search['token']
    return typeof token === 'string' && token.length > 0 ? { token } : {}
  },
  component: ResetPasswordPage,
})

function ResetPasswordPage() {
  const { t } = useTranslation('auth')
  const { token } = Route.useSearch()
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [done, setDone] = useState(false)
  const [error, setError] = useState<AuthErrorInfo>(null)
  const [busy, setBusy] = useState(false)

  const changePassword = (event: ChangeEvent<HTMLInputElement>) => {
    setPassword(event.target.value)
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!token) return
    setBusy(true)
    setError(null)
    const result = await authClient.resetPassword({ newPassword: password, token })
    setBusy(false)
    if (result.error) {
      setError(result.error)
      return
    }
    setDone(true)
    // The token is spent; keep it out of the address bar.
    await router.navigate({ to: '/reset-password', search: {}, replace: true })
  }

  return (
    <AuthFrame
      title={t('resetPassword.title')}
      footer={
        <Link to="/sign-in" className="underline hover:text-ink">
          {t('resetPassword.toSignIn')}
        </Link>
      }
    >
      {token ? (
        <form className="flex flex-col gap-3" onSubmit={submit}>
          <AuthField
            id="password"
            label={t('resetPassword.password')}
            hint={t('resetPassword.passwordHint')}
            type="password"
            autoComplete="new-password"
            required
            value={password}
            onChange={changePassword}
          />
          <AuthError error={error} />
          {done ? <p className="text-small text-ink-2">{t('resetPassword.done')}</p> : null}
          <Button type="submit" disabled={busy}>
            {t('resetPassword.submit')}
          </Button>
        </form>
      ) : (
        <div className="flex flex-col gap-3">
          {done ? (
            <p className="text-small text-ink-2">{t('resetPassword.done')}</p>
          ) : (
            <>
              <p className="max-w-[65ch] text-body text-ink-2">{t('resetPassword.missingToken')}</p>
              <Link to="/forgot-password" className="text-small text-ink-2 underline hover:text-ink">
                {t('resetPassword.askAgain')}
              </Link>
            </>
          )}
        </div>
      )}
    </AuthFrame>
  )
}
