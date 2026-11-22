import { Link } from '@tanstack/react-router'
import { ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../../ui/Button.tsx'
import { doneOfTotal, useProjects, type Project } from './api.ts'
import { ProjectSheet } from './ProjectSheet.tsx'

/** The projects list (More → Projects): progress as a sentence, warnings as a quiet line (DESIGN §6). */
export function ProjectsPage() {
  const { t } = useTranslation('projects')
  const projects = useProjects()
  const [editing, setEditing] = useState<Project | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)

  const openSheet = (project: Project | null) => {
    setEditing(project)
    setSheetOpen(true)
  }

  if (projects.isPending) return <p className="text-body text-ink-2">{t('loading')}</p>
  if (!projects.data) return <p className="text-body text-ink-2">{t('loadError')}</p>

  return (
    <section className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-title">{t('title')}</h1>
        <Button type="button" variant="secondary" onClick={() => openSheet(null)}>
          {t('add')}
        </Button>
      </div>

      {projects.data.length === 0 ? <p className="max-w-[65ch] text-body text-ink-2">{t('empty')}</p> : null}

      <ul className="flex flex-col">
        {projects.data.map((entry) => {
          const counts = doneOfTotal(entry)
          const progress =
            entry.progress === null
              ? t('noTasks')
              : counts === null
                ? t('allDone')
                : t('progress', counts)

          return (
            <li key={entry.project.id} className="border-b border-line last:border-b-0">
              <div className="flex items-center gap-3">
                <Link
                  to="/projects/$projectId"
                  params={{ projectId: entry.project.id }}
                  className="flex min-h-13 flex-1 flex-col justify-center py-2 motion-quick hover:text-ink-2"
                >
                  <span className="text-body text-ink">{entry.project.name}</span>
                  <span className="text-meta text-ink-3">{progress}</span>
                  {entry.warnings.map((warning) => (
                    <span key={warning} className="text-meta text-ink-2">
                      {t(`warnings.${warning}`)}
                    </span>
                  ))}
                </Link>
                <button
                  type="button"
                  className="min-h-11 rounded-control px-3 text-small text-ink-2 motion-quick hover:bg-surface-sunken hover:text-ink"
                  onClick={() => openSheet(entry.project)}
                >
                  {t('sheet.editTitle')}
                </button>
                <ChevronRight size={20} aria-hidden="true" className="text-ink-3" />
              </div>
            </li>
          )
        })}
      </ul>

      <ProjectSheet key={editing?.id ?? 'new'} open={sheetOpen} onOpenChange={setSheetOpen} project={editing} />
    </section>
  )
}
