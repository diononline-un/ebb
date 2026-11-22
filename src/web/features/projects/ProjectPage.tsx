import { useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from '@tanstack/react-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Task, TaskPatch } from '../../../shared/schemas/task.ts'
import { Button } from '../../ui/Button.tsx'
import { deleteTask, usePatchTask, useToday, type TaskPatcher } from '../tasks/api.ts'
import { TaskRow } from '../tasks/TaskRow.tsx'
import { TaskSheet } from '../tasks/TaskSheet.tsx'
import { useProject } from './api.ts'
import { ProjectSheet } from './ProjectSheet.tsx'

/** One project: its progress, its warnings and the tasks that hang on it (PRD F10). */
export function ProjectPage() {
  const { t } = useTranslation('projects')
  const { projectId } = useParams({ from: '/projects_/$projectId' })
  const project = useProject(projectId)
  const day = useToday()
  const patchTask = usePatchTask()
  const queryClient = useQueryClient()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)

  if (project.isPending) return <p className="text-body text-ink-2">{t('loading')}</p>
  if (!project.data) return <p className="text-body text-ink-2">{t('loadError')}</p>

  const { tasks } = project.data
  const today = day.data?.date ?? ''
  const counted = tasks.filter((task) => task.status !== 'skipped')
  const done = counted.filter((task) => task.status === 'done').length
  const progress = counted.length === 0 ? t('noTasks') : t('progress', { done, total: counted.length })
  const selected = tasks.find((task) => task.id === selectedId) ?? null

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['projects'] })
    await queryClient.invalidateQueries({ queryKey: ['tasks'] })
  }

  const patch: TaskPatcher = async (id: string, body: TaskPatch) => {
    const result = await patchTask.mutateAsync({ id, patch: body })
    await queryClient.invalidateQueries({ queryKey: ['projects'] })
    return result
  }

  const toggle = (task: Task) => {
    void patch(task.id, { status: task.status === 'done' ? 'todo' : 'done' })
  }

  const remove = async (id: string) => {
    await deleteTask(id)
    await refresh()
  }

  return (
    <section className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <Link to="/projects" className="text-small text-ink-2 underline hover:text-ink">
          {t('backToProjects')}
        </Link>
        <h1 className="text-title">{project.data.project.name}</h1>
        <p className="text-meta text-ink-3">{t(`status.${project.data.project.status}`)}</p>
        <p className="text-meta text-ink-2">{progress}</p>
        {project.data.warnings.map((warning) => (
          <p key={warning} className="text-meta text-ink-2">
            {t(`warnings.${warning}`)}
          </p>
        ))}
      </div>

      <Button type="button" variant="secondary" onClick={() => setEditing(true)}>
        {t('sheet.editTitle')}
      </Button>

      <div className="flex flex-col gap-2">
        <h2 className="text-heading">{t('tasksHeading')}</h2>
        {tasks.length === 0 ? (
          <p className="text-body text-ink-2">{t('noProjectTasks')}</p>
        ) : (
          <ul className="flex flex-col">
            {tasks.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                today={today}
                onToggle={toggle}
                onOpen={(entry) => setSelectedId(entry.id)}
              />
            ))}
          </ul>
        )}
      </div>

      <TaskSheet
        task={selected}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null)
        }}
        onPatch={patch}
        onDelete={remove}
      />

      <ProjectSheet
        key={editing ? 'edit' : 'closed'}
        open={editing}
        onOpenChange={setEditing}
        project={editing ? project.data.project : null}
      />
    </section>
  )
}
