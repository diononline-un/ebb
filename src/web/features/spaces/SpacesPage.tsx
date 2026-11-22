import { Link } from '@tanstack/react-router'
import { ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ApiError } from '../../lib/api.ts'
import { Button } from '../../ui/Button.tsx'
import { Input } from '../../ui/Input.tsx'
import { Sheet } from '../../ui/Sheet.tsx'
import { useCreateSpace, useSpaces } from './api.ts'

/** The spaces list (More → Spaces): the personal one first, then the shared ones (PRD F13). */
export function SpacesPage() {
  const { t } = useTranslation('spaces')
  const spaces = useSpaces()
  const [creating, setCreating] = useState(false)

  if (spaces.isPending) return <p className="text-body text-ink-2">{t('loading')}</p>
  if (!spaces.data) return <p className="text-body text-ink-2">{t('loadError')}</p>

  return (
    <section className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-title">{t('title')}</h1>
        <Button type="button" variant="secondary" onClick={() => setCreating(true)}>
          {t('add')}
        </Button>
      </div>

      {spaces.data.length === 0 ? <p className="max-w-[65ch] text-body text-ink-2">{t('empty')}</p> : null}

      <ul className="flex flex-col">
        {spaces.data.map((space) => (
          <li key={space.id} className="border-b border-line last:border-b-0">
            <Link
              to="/spaces/$spaceId"
              params={{ spaceId: space.id }}
              aria-label={t('open', { name: space.name })}
              className="flex min-h-13 items-center gap-3 py-2 motion-quick hover:text-ink-2"
            >
              <span className="flex flex-1 flex-col justify-center">
                <span className="text-body text-ink">{space.name}</span>
                <span className="text-meta text-ink-3">
                  {t(`kind.${space.kind}`)} · {t('memberCount', { count: space.memberCount })}
                </span>
              </span>
              <ChevronRight size={20} aria-hidden="true" className="text-ink-3" />
            </Link>
          </li>
        ))}
      </ul>

      <CreateSpaceSheet open={creating} onOpenChange={setCreating} />
    </section>
  )
}

type CreateSpaceSheetProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** A shared space needs a name and nothing else; people come in by invitation. */
function CreateSpaceSheet({ open, onOpenChange }: CreateSpaceSheetProps) {
  const { t } = useTranslation('spaces')
  const create = useCreateSpace()
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)

  const save = async () => {
    setError(null)
    try {
      await create.mutateAsync(name.trim())
      setName('')
      onOpenChange(false)
    } catch (failure) {
      const code = failure instanceof ApiError ? failure.code : 'generic'
      setError(t(`errors.${code}`, { defaultValue: t('errors.generic') }))
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={t('sheet.createTitle')}
      description={t('sheet.hint')}
      footer={
        <>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            {t('sheet.cancel')}
          </Button>
          <Button type="button" disabled={!name.trim()} onClick={() => void save()}>
            {t('sheet.save')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="space-name-new" className="text-small text-ink-2">
            {t('sheet.nameLabel')}
          </label>
          <Input
            id="space-name-new"
            value={name}
            maxLength={80}
            onChange={(event) => setName(event.target.value)}
          />
        </div>

        {error ? (
          <p role="alert" className="text-small text-danger">
            {error}
          </p>
        ) : null}
      </div>
    </Sheet>
  )
}
