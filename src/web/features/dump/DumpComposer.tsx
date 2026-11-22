import { useState, type ChangeEvent, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../../ui/Button.tsx'
import { Textarea } from '../../ui/Textarea.tsx'
import type { DumpComposerProps } from './types.ts'

/** The one field at the bottom of the dump: Enter keeps the thought, Shift and Enter break the line. */
export function DumpComposer({ onSubmit, busy, error }: DumpComposerProps) {
  const { t } = useTranslation('dump')
  const [draft, setDraft] = useState('')

  const change = (event: ChangeEvent<HTMLTextAreaElement>) => {
    setDraft(event.target.value)
  }

  const keep = async () => {
    if (!draft.trim()) return
    const kept = await onSubmit(draft)
    if (kept) setDraft('')
  }

  const keyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || event.shiftKey) return
    event.preventDefault()
    void keep()
  }

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault()
        void keep()
      }}
    >
      <label htmlFor="dump-composer" className="text-small text-ink-2">
        {t('composer.label')}
      </label>
      <Textarea
        id="dump-composer"
        value={draft}
        maxLength={500}
        placeholder={t('composer.placeholder')}
        onChange={change}
        onKeyDown={keyDown}
      />
      {error ? (
        <p role="alert" className="text-small text-danger">
          {error}
        </p>
      ) : (
        <p className="text-meta text-ink-3">{t('composer.hint')}</p>
      )}
      <Button type="submit" className="disabled:bg-surface-sunken" disabled={busy || !draft.trim()}>
        {t('composer.submit')}
      </Button>
    </form>
  )
}
