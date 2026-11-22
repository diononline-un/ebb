import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Goal, GoalStatus } from '../../../shared/schemas/goals.ts'
import { ApiError } from '../../lib/api.ts'
import { Button } from '../../ui/Button.tsx'
import { Dialog } from '../../ui/Dialog.tsx'
import { Input } from '../../ui/Input.tsx'
import { Sheet } from '../../ui/Sheet.tsx'
import { Textarea } from '../../ui/Textarea.tsx'
import { useCreateGoal, useDeleteGoal, usePatchGoal } from './api.ts'

const STATUSES: GoalStatus[] = ['active', 'paused', 'done']

export type GoalSheetProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The goal being edited, or null to create one. */
  goal: Goal | null
}

/** Title, why and status of one goal; the delete question lives behind a dialog (DESIGN §11). */
export function GoalSheet({ open, onOpenChange, goal }: GoalSheetProps) {
  const { t } = useTranslation('goals')
  const create = useCreateGoal()
  const patch = usePatchGoal()
  const remove = useDeleteGoal()
  const [title, setTitle] = useState(goal?.title ?? '')
  const [why, setWhy] = useState(goal?.why ?? '')
  const [status, setStatus] = useState<GoalStatus>(goal?.status ?? 'active')
  const [error, setError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  const save = async () => {
    setError(null)
    try {
      if (goal) await patch.mutateAsync({ id: goal.id, patch: { title: title.trim(), why, status } })
      else await create.mutateAsync({ title: title.trim(), why, status })
      onOpenChange(false)
    } catch (failure) {
      const code = failure instanceof ApiError ? failure.code : 'generic'
      setError(t(`errors.${code}`, { defaultValue: t('errors.generic') }))
    }
  }

  const confirmDelete = async () => {
    if (!goal) return
    await remove.mutateAsync(goal.id)
    setDeleting(false)
    onOpenChange(false)
  }

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={goal ? t('sheet.editTitle') : t('sheet.createTitle')}
      footer={
        <>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            {t('sheet.cancel')}
          </Button>
          <Button type="button" disabled={!title.trim()} onClick={() => void save()}>
            {t('sheet.save')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="goal-title" className="text-small text-ink-2">
            {t('sheet.titleLabel')}
          </label>
          <Input id="goal-title" value={title} maxLength={80} onChange={(event) => setTitle(event.target.value)} />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="goal-why" className="text-small text-ink-2">
            {t('sheet.whyLabel')}
          </label>
          <Textarea id="goal-why" value={why} maxLength={280} rows={3} onChange={(event) => setWhy(event.target.value)} />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="goal-status" className="text-small text-ink-2">
            {t('sheet.statusLabel')}
          </label>
          <select
            id="goal-status"
            value={status}
            onChange={(event) => setStatus(event.target.value as GoalStatus)}
            className="min-h-11 rounded-control border border-line bg-surface-sunken px-3 text-body text-ink"
          >
            {STATUSES.map((value) => (
              <option key={value} value={value}>
                {t(`status.${value}`)}
              </option>
            ))}
          </select>
        </div>

        {error ? (
          <p role="alert" className="text-small text-danger">
            {error}
          </p>
        ) : null}

        {goal ? (
          <Button type="button" variant="danger" onClick={() => setDeleting(true)}>
            {t('sheet.delete')}
          </Button>
        ) : null}
      </div>

      <Dialog
        open={deleting}
        onOpenChange={setDeleting}
        title={t('sheet.deleteQuestion')}
        description={t('sheet.deleteText')}
        footer={
          <>
            <Button type="button" variant="ghost" onClick={() => setDeleting(false)}>
              {t('sheet.cancel')}
            </Button>
            <Button type="button" variant="danger" onClick={() => void confirmDelete()}>
              {t('sheet.deleteConfirm')}
            </Button>
          </>
        }
      />
    </Sheet>
  )
}
