import { useTranslation } from 'react-i18next'

export type AuthErrorInfo = { code?: string | null; status?: number | null } | null

// Better Auth reports a code (and a status); the UI shows one calm sentence per case (§9).
const BY_CODE: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: 'invalidCredentials',
  EMAIL_NOT_VERIFIED: 'emailNotVerified',
  USER_ALREADY_EXISTS: 'userAlreadyExists',
  PASSWORD_TOO_SHORT: 'passwordTooShort',
  INVALID_TOKEN: 'invalidToken',
  AUTH_CANCELLED: 'passkeyCancelled',
  REGISTRATION_CANCELLED: 'passkeyCancelled',
}

export function AuthError({ error }: { error: AuthErrorInfo }) {
  const { t } = useTranslation('auth')
  if (!error) return null

  const key = error.status === 429 ? 'rateLimited' : (BY_CODE[error.code ?? ''] ?? 'generic')

  return (
    <p role="alert" className="text-small text-danger">
      {t(`errors.${key}`)}
    </p>
  )
}
