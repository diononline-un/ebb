import { useState, type ChangeEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { Task, TaskPatch } from '../../../shared/schemas/task.ts'
import { ApiError } from '../../lib/api.ts'
import { Button } from '../../ui/Button.tsx'
import { Checkbox } from '../../ui/Checkbox.tsx'
import { Dialog } from '../../ui/Dialog.tsx'
import { Input } from '../../ui/Input.tsx'
import { Sheet } from '../../ui/Sheet.tsx'
import { Textarea } from '../../ui/Textarea.tsx'

import type { DeleteHandler, PatchHandler, TaskPatcher, TaskResult, TaskStatus } from './api.ts'
import { AssigneeField } from './AssigneeField.tsx'
import { RecurrenceField } from './RecurrenceField.tsx'
import { SpaceField } from './SpaceField.tsx'
import { Subtasks } from './Subtasks.tsx'

const STATUSES: TaskStatus[] = ['todo', 'doing', 'waiting', 'done', 'skipped']

export type TaskSheetFieldsProps = {
  task: Task
  onPatch: PatchHandler
  onDelete: () => Promise<void>
  onClose: () => void
  /** Subtasks and repeat read the server, so the sheet adds them; the fields stay free of queries. */
  sections?: ReactNode
}

/**
 * Everything inside the task sheet. Split out so a component test can drive it without the dialog
 * machinery around it.
 */
export function TaskSheetFields({ task, onPatch, onDelete, onClose, sections }: TaskSheetFieldsProps) {
  const { t } = useTranslation('tasks')
  const [title, setTitle] = useState(task.title)
  const [notes, setNotes] = useState(task.notes)
  const [error, setError] = useState<string | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])
  const [anchorConflict, setAnchorConflict] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  const save = async (patch: TaskPatch) => {
    setError(null)
    setAnchorConflict(false)
    try {
      const result = await onPatch(patch)
      setWarnings(result.warnings)
    } catch (failure) {
      if (failure instanceof ApiError && failure.code === 'anchor_exists') {
        setAnchorConflict(true)
        return
      }
      if (failure instanceof ApiError && failure.code === 'must_limit') {
        setError(t('errors.must_limit'))
        return
      }
      setError(t('errors.generic'))
    }
  }

  const changeTitle = (event: ChangeEvent<HTMLInputElement>) => {
    setTitle(event.target.value)
  }

  const changeNotes = (event: ChangeEvent<HTMLTextAreaElement>) => {
    setNotes(event.target.value)
  }

  const commitTitle = () => {
    const trimmed = title.trim()
    if (!trimmed || trimmed === task.title) {
      setTitle(task.title)
      return
    }
    void save({ title: trimmed })
  }

  const commitNotes = () => {
    if (notes === task.notes) return
    void save({ notes })
  }

  const remove = async () => {
    await onDelete()
    setDeleteOpen(false)
    onClose()
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label htmlFor="task-title" className="text-small text-ink-2">
          {t('sheet.titleLabel')}
        </label>
        <Input id="task-title" value={title} maxLength={200} onChange={changeTitle} onBlur={commitTitle} />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="task-notes" className="text-small text-ink-2">
          {t('sheet.notesLabel')}
        </label>
        <Textarea id="task-notes" value={notes} maxLength={5000} onChange={changeNotes} onBlur={commitNotes} />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="task-do-date" className="text-small text-ink-2">
          {t('sheet.doDateLabel')}
        </label>
        <Input
          id="task-do-date"
          type="date"
          value={task.doDate ?? ''}
          onChange={(event) => void save({ doDate: event.target.value || null })}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="task-deadline" className="text-small text-ink-2">
          {t('sheet.deadlineLabel')}
        </label>
        <Input
          id="task-deadline"
          type="date"
          value={task.deadline ?? ''}
          onChange={(event) => void save({ deadline: event.target.value || null })}
        />
      </div>

      <div className="flex min-h-11 items-center gap-2">
        <Checkbox
          id="task-must"
          checked={task.must}
          onCheckedChange={(checked) => void save({ must: checked === true })}
        />
        <label htmlFor="task-must" className="text-body text-ink">
          {t('sheet.mustLabel')}
        </label>
      </div>

      <div className="flex min-h-11 items-center gap-2">
        <Checkbox
          id="task-anchor"
          checked={task.anchor}
          onCheckedChange={(checked) => void save({ anchor: checked === true })}
        />
        <label htmlFor="task-anchor" className="text-body text-ink">
          {t('sheet.anchorLabel')}
        </label>
      </div>

      {anchorConflict ? (
        <div role="alertdialog" aria-label={t('sheet.replaceQuestion')} className="flex flex-col gap-2 rounded-control border border-line p-3">
          <p className="text-body text-ink">{t('sheet.replaceQuestion')}</p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => void save({ anchor: true, replaceAnchor: true })}>
              {t('sheet.replaceAction')}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setAnchorConflict(false)}>
              {t('sheet.keepAnchor')}
            </Button>
          </div>
        </div>
      ) : null}

      <div className="flex flex-col gap-1">
        <label htmlFor="task-status" className="text-small text-ink-2">
          {t('sheet.statusLabel')}
        </label>
        <select
          id="task-status"
          value={task.status}
          onChange={(event) => void save({ status: event.target.value as TaskStatus })}
          className="min-h-11 rounded-control border border-line bg-surface-sunken px-3 text-body text-ink"
        >
          {STATUSES.map((status) => (
            <option key={status} value={status}>
              {t(`status.${status}`)}
            </option>
          ))}
        </select>
      </div>

      {sections}

      {warnings.length > 0 ? (
        <ul className="flex flex-col gap-1">
          {warnings.map((warning) => (
            <li key={warning} className="text-small text-ink-2">
              {t(`warnings.${warning}`)}
            </li>
          ))}
        </ul>
      ) : null}

      {error ? (
        <p role="alert" className="text-small text-danger">
          {error}
        </p>
      ) : null}

      <Button type="button" variant="danger" onClick={() => setDeleteOpen(true)}>
        {t('sheet.delete')}
      </Button>

      <Dialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={t('sheet.deleteQuestion')}
        description={t('sheet.deleteText')}
        footer={
          <>
            <Button type="button" variant="ghost" onClick={() => setDeleteOpen(false)}>
              {t('sheet.cancel')}
            </Button>
            <Button type="button" variant="danger" onClick={() => void remove()}>
              {t('sheet.deleteConfirm')}
            </Button>
          </>
        }
      />
    </div>
  )
}

export type TaskSheetProps = {
  task: Task | null
  onOpenChange: (open: boolean) => void
  onPatch: TaskPatcher
  onDelete: DeleteHandler
}

/** Task details live in a sheet, never in a modal (DESIGN §11). */
export function TaskSheet({ task, onOpenChange, onPatch, onDelete }: TaskSheetProps) {
  const { t } = useTranslation('tasks')
  const open = task !== null

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={t('sheet.title')}
      description={task?.title}
      footer={
        <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
          {t('common:actions.close')}
        </Button>
      }
    >
      {task ? (
        <TaskSheetFields
          key={task.id}
          task={task}
          onPatch={(patch) => onPatch(task.id, patch)}
          onDelete={() => onDelete(task.id)}
          onClose={() => onOpenChange(false)}
          sections={
            <>
              <Subtasks task={task} />
              <RecurrenceField task={task} />
              <SpaceField task={task} />
              <AssigneeField task={task} />
            </>
          }
        />
      ) : null}
    </Sheet>
  )
}
