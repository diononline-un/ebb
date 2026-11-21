import { createFileRoute, Link } from '@tanstack/react-router'
import { useState, type ChangeEvent, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { AuthError, type AuthErrorInfo } from '../features/auth/AuthError.tsx'
import { AuthField } from '../features/auth/AuthField.tsx'
import { AuthFrame } from '../features/auth/AuthFrame.tsx'
import { authClient } from '../lib/auth-client.ts'
import { Button } from '../ui/Button.tsx'

export const Route = createFileRoute('/verify-email')({
  component: VerifyEmailPage,
})

function VerifyEmailPage() {
  const { t } = useTranslation('auth')
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<AuthErrorInfo>(null)
  const [busy, setBusy] = useState(false)

  const changeEmail = (event: ChangeEvent<HTMLInputElement>) => {
    setEmail(event.target.value)
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    const result = await authClient.sendVerificationEmail({ email, callbackURL: '/today' })
    setBusy(false)
    if (result.error) {
      setError(result.error)
      return
    }
    setSent(true)
  }

  return (
    <AuthFrame
      title={t('verifyEmail.title')}
      footer={
        <Link to="/sign-in" className="underline hover:text-ink">
          {t('verifyEmail.alreadyConfirmed')}
        </Link>
      }
    >
      <p className="max-w-[65ch] text-body text-ink-2">{t('verifyEmail.sent')}</p>
      <form className="flex flex-col gap-3" onSubmit={submit}>
        <AuthField
          id="email"
          label={t('verifyEmail.email')}
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={changeEmail}
        />
        <AuthError error={error} />
        {sent ? <p className="text-small text-ink-2">{t('verifyEmail.resent')}</p> : null}
        <Button type="submit" variant="secondary" disabled={busy}>
          {t('verifyEmail.resend')}
        </Button>
      </form>
    </AuthFrame>
  )
}
