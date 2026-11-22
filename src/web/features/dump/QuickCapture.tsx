import { useEffect, useState, type ChangeEvent, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../../ui/Button.tsx'
import { Sheet } from '../../ui/Sheet.tsx'
import { Textarea } from '../../ui/Textarea.tsx'
import { useDumpSubmit } from './api.ts'
import { useDumpQueue } from './useDumpQueue.ts'

export type QuickCaptureProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** The plus button's sheet, plus the `n` shortcut on desktop. Mounted once by the app shell. */
export function QuickCapture({ open, onOpenChange }: QuickCaptureProps) {
  const { t } = useTranslation('dump')
  const { submit, busy, error } = useDumpSubmit()
  const [draft, setDraft] = useState('')
  // Mounted app-wide, so this is also where a queued thought gets replayed after a restart.
  useDumpQueue()

  useEffect(() => {
    const keyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'n' || event.metaKey || event.ctrlKey || event.altKey || event.repeat) return
      const target = event.target as HTMLElement | null
      const tag = target?.tagName ?? ''
      if (target?.isContentEditable || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      event.preventDefault()
      onOpenChange(true)
    }

    window.addEventListener('keydown', keyDown)
    return () => window.removeEventListener('keydown', keyDown)
  }, [onOpenChange])

  const change = (event: ChangeEvent<HTMLTextAreaElement>) => {
    setDraft(event.target.value)
  }

  const keep = async () => {
    if (!draft.trim()) return
    const kept = await submit(draft)
    if (!kept) return
    setDraft('')
    onOpenChange(false)
  }

  const keyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || event.shiftKey) return
    event.preventDefault()
    void keep()
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={t('quickCapture.title')}>
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault()
          void keep()
        }}
      >
        <Textarea
          id="quick-capture"
          value={draft}
          maxLength={500}
          autoFocus
          placeholder={t('quickCapture.placeholder')}
          onChange={change}
          onKeyDown={keyDown}
        />
        {error ? (
          <p role="alert" className="text-small text-danger">
            {error}
          </p>
        ) : null}
        <Button type="submit" className="disabled:bg-surface-sunken" disabled={busy || !draft.trim()}>
          {t('quickCapture.submit')}
        </Button>
      </form>
    </Sheet>
  )
}
