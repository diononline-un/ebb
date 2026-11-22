import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ProjectStatus } from '../../../shared/schemas/projects.ts'
import { ApiError } from '../../lib/api.ts'
import { Button } from '../../ui/Button.tsx'
import { Dialog } from '../../ui/Dialog.tsx'
import { Input } from '../../ui/Input.tsx'
import { Sheet } from '../../ui/Sheet.tsx'
import { useGoals } from '../goals/api.ts'
import { useCreateProject, useDeleteProject, usePatchProject, type Project } from './api.ts'

const STATUSES: ProjectStatus[] = ['active', 'paused', 'done']

export type ProjectSheetProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The project being edited, or null to create one. */
  project: Project | null
}

/** Name, goal, start, deadline and status of one project; deleting asks first (DESIGN §11). */
export function ProjectSheet({ open, onOpenChange, project }: ProjectSheetProps) {
  const { t } = useTranslation('projects')
  const goals = useGoals()
  const create = useCreateProject()
  const patch = usePatchProject()
  const remove = useDeleteProject()
  const [name, setName] = useState(project?.name ?? '')
  const [goalId, setGoalId] = useState(project?.goalId ?? '')
  const [startDate, setStartDate] = useState(project?.startDate ?? '')
  const [deadline, setDeadline] = useState(project?.deadline ?? '')
  const [status, setStatus] = useState<ProjectStatus>(project?.status ?? 'active')
  const [error, setError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  const save = async () => {
    setError(null)
    const fields = {
      name: name.trim(),
      goalId: goalId || null,
      startDate: startDate || null,
      deadline: deadline || null,
    }

    try {
      if (project) await patch.mutateAsync({ id: project.id, patch: { ...fields, status } })
      else await create.mutateAsync(fields)
      onOpenChange(false)
    } catch (failure) {
      const code = failure instanceof ApiError ? failure.code : 'generic'
      setError(t(`errors.${code}`, { defaultValue: t('errors.generic') }))
    }
  }

  const confirmDelete = async () => {
    if (!project) return
    await remove.mutateAsync(project.id)
    setDeleting(false)
    onOpenChange(false)
  }

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={project ? t('sheet.editTitle') : t('sheet.createTitle')}
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
          <label htmlFor="project-name" className="text-small text-ink-2">
            {t('sheet.nameLabel')}
          </label>
          <Input id="project-name" value={name} maxLength={80} onChange={(event) => setName(event.target.value)} />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="project-goal" className="text-small text-ink-2">
            {t('sheet.goalLabel')}
          </label>
          <select
            id="project-goal"
            value={goalId}
            onChange={(event) => setGoalId(event.target.value)}
            className="min-h-11 rounded-control border border-line bg-surface-sunken px-3 text-body text-ink"
          >
            <option value="">{t('sheet.goalNone')}</option>
            {(goals.data ?? []).map((goal) => (
              <option key={goal.id} value={goal.id}>
                {goal.title}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="project-start" className="text-small text-ink-2">
            {t('sheet.startLabel')}
          </label>
          <Input
            id="project-start"
            type="date"
            value={startDate}
            onChange={(event) => setStartDate(event.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="project-deadline" className="text-small text-ink-2">
            {t('sheet.deadlineLabel')}
          </label>
          <Input
            id="project-deadline"
            type="date"
            value={deadline}
            onChange={(event) => setDeadline(event.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="project-status" className="text-small text-ink-2">
            {t('sheet.statusLabel')}
          </label>
          <select
            id="project-status"
            value={status}
            onChange={(event) => setStatus(event.target.value as ProjectStatus)}
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

        {project ? (
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
