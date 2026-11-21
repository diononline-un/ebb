import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import { useState, type ChangeEvent, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { AuthError, type AuthErrorInfo } from '../features/auth/AuthError.tsx'
import { AuthField } from '../features/auth/AuthField.tsx'
import { AuthFrame } from '../features/auth/AuthFrame.tsx'
import { authClient } from '../lib/auth-client.ts'
import { Button } from '../ui/Button.tsx'

export const Route = createFileRoute('/sign-in')({
  // Only same-app paths are allowed as a return target (no open redirect).
  validateSearch: (search: Record<string, unknown>): { next?: string } => {
    const next = search['next']
    // Backslashes are refused too: browsers normalise "/\evil.example" to "//evil.example".
    return typeof next === 'string' && next.startsWith('/') && !next.startsWith('//') && !next.includes('\\')
      ? { next }
      : {}
  },
  component: SignInPage,
})

function SignInPage() {
  const { t } = useTranslation('auth')
  const { next } = Route.useSearch()
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<AuthErrorInfo>(null)
  const [busy, setBusy] = useState(false)
  const target = next ?? '/today'

  const changeEmail = (event: ChangeEvent<HTMLInputElement>) => {
    setEmail(event.target.value)
  }

  const changePassword = (event: ChangeEvent<HTMLInputElement>) => {
    setPassword(event.target.value)
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    const result = await authClient.signIn.email({ email, password })
    setBusy(false)
    if (result.error) {
      setError(result.error)
      return
    }
    await router.history.push(target)
  }

  const signInWithPasskey = async () => {
    setBusy(true)
    setError(null)
    const result = await authClient.signIn.passkey({ autoFill: false })
    setBusy(false)
    if (result.error) {
      setError(result.error)
      return
    }
    await router.history.push(target)
  }

  return (
    <AuthFrame
      title={t('signIn.title')}
      footer={
        <>
          <Link to="/forgot-password" className="underline hover:text-ink">
            {t('signIn.forgot')}
          </Link>
          <Link to="/sign-up" className="underline hover:text-ink">
            {t('signIn.noAccount')}
          </Link>
        </>
      }
    >
      <form className="flex flex-col gap-3" onSubmit={submit}>
        <AuthField
          id="email"
          label={t('signIn.email')}
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={changeEmail}
        />
        <AuthField
          id="password"
          label={t('signIn.password')}
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={changePassword}
        />
        <AuthError error={error} />
        <Button type="submit" disabled={busy}>
          {t('signIn.submit')}
        </Button>
      </form>
      <Button type="button" variant="secondary" disabled={busy} onClick={signInWithPasskey}>
        {t('signIn.passkey')}
      </Button>
    </AuthFrame>
  )
}
