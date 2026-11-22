import { Link, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { InviteIssued } from '../../../shared/schemas/spaces.ts'
import { ApiError } from '../../lib/api.ts'
import { Button } from '../../ui/Button.tsx'
import { Dialog } from '../../ui/Dialog.tsx'
import { Input } from '../../ui/Input.tsx'
import {
  useCreateInvite,
  useDeleteSpace,
  useLeaveSpace,
  useMembers,
  useRemoveMember,
  useRenameSpace,
  useSpaces,
} from './api.ts'
import { MembersList } from './MembersList.tsx'
import { Unassigned } from './Unassigned.tsx'

export type SpacePageProps = { spaceId: string }

/** One space: its name, its people, the invitation link and the two ways out (PRD F13). */
export function SpacePage({ spaceId }: SpacePageProps) {
  const { t } = useTranslation('spaces')
  const navigate = useNavigate()
  const spaces = useSpaces()
  const members = useMembers(spaceId)
  const rename = useRenameSpace()
  const invite = useCreateInvite()
  const removeMember = useRemoveMember()
  const leave = useLeaveSpace()
  const removeSpace = useDeleteSpace()
  // Null means "not typed yet", so a rename or a refetch keeps the field in step with the server.
  const [draftName, setDraftName] = useState<string | null>(null)
  const [issued, setIssued] = useState<InviteIssued | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [typedName, setTypedName] = useState('')
  const [deleteError, setDeleteError] = useState<string | null>(null)

  if (spaces.isPending) return <p className="text-body text-ink-2">{t('loading')}</p>
  const space = spaces.data?.find((entry) => entry.id === spaceId)
  if (!space) return <p className="text-body text-ink-2">{t('loadError')}</p>

  const isOwner = space.role === 'owner'
  const shared = space.kind === 'shared'
  const name = draftName ?? space.name
  const link = issued ? new URL(`/join/${issued.token}`, window.location.origin).toString() : ''
  // A share sheet only exists on phones and on desktop browsers with the API switched on.
  const canShare = typeof navigator.share === 'function'

  const fail = (failure: unknown, fallback: (message: string) => void) => {
    const code = failure instanceof ApiError ? failure.code : 'generic'
    fallback(t(`errors.${code}`, { defaultValue: t('errors.generic') }))
  }

  const saveName = async () => {
    setError(null)
    try {
      await rename.mutateAsync({ id: space.id, name: name.trim() })
      setDraftName(null)
    } catch (failure) {
      fail(failure, setError)
    }
  }

  const createLink = async () => {
    setError(null)
    setCopied(false)
    try {
      setIssued(await invite.mutateAsync(space.id))
    } catch (failure) {
      fail(failure, setError)
    }
  }

  const copyLink = async () => {
    try {
      await navigator.clipboard?.writeText(link)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  const shareLink = () => {
    // The share sheet is the phone path; a refusal leaves the link on screen, so nothing is lost.
    void navigator.share({ url: link }).catch(() => {})
  }

  const kick = async (userId: string) => {
    setError(null)
    try {
      await removeMember.mutateAsync({ spaceId: space.id, userId })
    } catch (failure) {
      fail(failure, setError)
    }
  }

  const walkAway = async () => {
    setError(null)
    try {
      await leave.mutateAsync(space.id)
      await navigate({ to: '/spaces' })
    } catch (failure) {
      fail(failure, setError)
    }
  }

  const drop = async () => {
    setDeleteError(null)
    try {
      await removeSpace.mutateAsync({ id: space.id, name: typedName })
      setDeleteOpen(false)
      await navigate({ to: '/spaces' })
    } catch (failure) {
      fail(failure, setDeleteError)
    }
  }

  return (
    <section className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <Link to="/spaces" className="text-small text-ink-2 underline hover:text-ink">
          {t('backToSpaces')}
        </Link>
        <h1 className="text-title">{space.name}</h1>
        <p className="text-meta text-ink-3">
          {t(`kind.${space.kind}`)} · {t('memberCount', { count: space.memberCount })}
        </p>
      </div>

      {isOwner ? (
        <div className="flex flex-col gap-2">
          <label htmlFor="space-name" className="text-small text-ink-2">
            {t('renameLabel')}
          </label>
          <div className="flex flex-wrap items-end gap-2">
            <Input
              id="space-name"
              value={name}
              maxLength={80}
              onChange={(event) => setDraftName(event.target.value)}
              className="flex-1"
            />
            <Button
              type="button"
              variant="secondary"
              disabled={!name.trim() || name.trim() === space.name}
              onClick={() => void saveName()}
            >
              {t('renameAction')}
            </Button>
          </div>
        </div>
      ) : null}

      {isOwner && shared ? (
        <div className="flex flex-col gap-2">
          <Button type="button" variant="secondary" onClick={() => void createLink()}>
            {t('invite')}
          </Button>
          {issued ? (
            <div className="flex flex-col gap-2 rounded-control border border-line p-3">
              <p className="text-small text-ink-2">{t('inviteHint')}</p>
              <p aria-label={t('inviteLinkLabel')} className="text-body break-all text-ink">
                {link}
              </p>
              <div className="flex flex-wrap gap-2">
                {canShare ? (
                  <Button type="button" onClick={shareLink}>
                    {t('share')}
                  </Button>
                ) : null}
                <Button type="button" variant="secondary" onClick={() => void copyLink()}>
                  {t('copy')}
                </Button>
                <Button type="button" variant="ghost" onClick={() => setIssued(null)}>
                  {t('inviteDone')}
                </Button>
              </div>
              {copied ? <p className="text-small text-ink-2">{t('copied')}</p> : null}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        <h2 className="text-heading">{t('peopleHeading')}</h2>
        <MembersList members={members.data ?? []} canRemove={isOwner} onRemove={(userId) => void kick(userId)} />
      </div>

      {shared ? <Unassigned spaceId={space.id} /> : null}

      {shared && !isOwner ? (
        <Button type="button" variant="danger" onClick={() => void walkAway()}>
          {t('leave')}
        </Button>
      ) : null}

      {shared && isOwner ? (
        <Button type="button" variant="danger" onClick={() => setDeleteOpen(true)}>
          {t('delete')}
        </Button>
      ) : null}

      {error ? (
        <p role="alert" className="text-small text-danger">
          {error}
        </p>
      ) : null}

      <Dialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={t('deleteQuestion')}
        description={t('deleteText')}
        footer={
          <>
            <Button type="button" variant="ghost" onClick={() => setDeleteOpen(false)}>
              {t('cancel')}
            </Button>
            <Button type="button" variant="danger" onClick={() => void drop()}>
              {t('deleteConfirm')}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-1">
          <label htmlFor="space-name-confirm" className="text-small text-ink-2">
            {t('deleteNameLabel')}
          </label>
          <Input
            id="space-name-confirm"
            value={typedName}
            maxLength={80}
            onChange={(event) => setTypedName(event.target.value)}
          />
        </div>
        {deleteError ? (
          <p role="alert" className="mt-2 text-small text-danger">
            {deleteError}
          </p>
        ) : null}
      </Dialog>
    </section>
  )
}
