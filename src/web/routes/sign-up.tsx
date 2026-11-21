import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import { useState, type ChangeEvent, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { AuthError, type AuthErrorInfo } from '../features/auth/AuthError.tsx'
import { AuthField } from '../features/auth/AuthField.tsx'
import { AuthFrame } from '../features/auth/AuthFrame.tsx'
import { authClient } from '../lib/auth-client.ts'
import { Button } from '../ui/Button.tsx'

export const Route = createFileRoute('/sign-up')({
  component: SignUpPage,
})

function SignUpPage() {
  const { t } = useTranslation('auth')
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<AuthErrorInfo>(null)
  const [busy, setBusy] = useState(false)

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
    // No name field yet: the account is addressed by its email until profiles arrive.
    const result = await authClient.signUp.email({ email, password, name: email.split('@')[0] ?? email })
    setBusy(false)
    if (result.error) {
      setError(result.error)
      return
    }
    await router.navigate({ to: '/verify-email' })
  }

  return (
    <AuthFrame
      title={t('signUp.title')}
      footer={
        <Link to="/sign-in" className="underline hover:text-ink">
          {t('signUp.haveAccount')}
        </Link>
      }
    >
      <form className="flex flex-col gap-3" onSubmit={submit}>
        <AuthField
          id="email"
          label={t('signUp.email')}
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={changeEmail}
        />
        <AuthField
          id="password"
          label={t('signUp.password')}
          hint={t('signUp.passwordHint')}
          type="password"
          autoComplete="new-password"
          required
          value={password}
          onChange={changePassword}
        />
        <AuthError error={error} />
        <Button type="submit" disabled={busy}>
          {t('signUp.submit')}
        </Button>
      </form>
    </AuthFrame>
  )
}
