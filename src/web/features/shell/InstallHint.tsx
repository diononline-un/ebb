import { X } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { IconButton } from '../../ui/IconButton.tsx'

const STORAGE_KEY = 'ebb.install-hint.dismissed'

function readDismissed(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

function isIosSafari(): boolean {
  const userAgent = navigator.userAgent
  const isIos = /iPad|iPhone|iPod/.test(userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  const isSafari = /Safari/.test(userAgent) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(userAgent)
  return isIos && isSafari
}

function isStandalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches
}

/**
 * iOS has no install prompt, so Safari users get one calm line with the manual steps (§9).
 * Quiet everywhere else and once dismissed, it stays away.
 */
export function InstallHint() {
  const { t } = useTranslation('install')
  const [dismissed, setDismissed] = useState(readDismissed)

  if (dismissed || !isIosSafari() || isStandalone()) return null

  const dismiss = () => {
    setDismissed(true)
    try {
      localStorage.setItem(STORAGE_KEY, '1')
    } catch {
      // Private mode without storage: the hint simply comes back next visit.
    }
  }

  return (
    <div className="flex items-start justify-between gap-3 border-t border-line pt-3">
      <p className="max-w-[65ch] text-small text-ink-2">{t('hint')}</p>
      <IconButton label={t('dismiss')} onClick={dismiss}>
        <X size={20} aria-hidden="true" />
      </IconButton>
    </div>
  )
}
