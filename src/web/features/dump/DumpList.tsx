import { Link } from '@tanstack/react-router'
import { Archive } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '../../ui/Button.tsx'
import { IconButton } from '../../ui/IconButton.tsx'
import { cn } from '../../lib/cn.ts'
import type { DumpListProps } from './types.ts'

export function DumpList({ entries, onToTask, onArchive }: DumpListProps) {
  const { t } = useTranslation('dump')

  return (
    <ul className="flex flex-col">
      {entries.map((entry) => (
        <li
          key={entry.id}
          className="flex min-h-11 items-start justify-between gap-3 border-b border-line py-2 last:border-b-0"
        >
          <div className="flex min-w-0 flex-col gap-1">
            <p
              className={cn(
                'text-body break-words',
                entry.taskId ? 'text-ink-3 line-through' : 'text-ink',
                entry.pending && 'text-ink-3',
              )}
            >
              {entry.text}
            </p>
            {entry.taskId ? (
              <Link to="/today" className="text-meta text-ink-2 underline hover:text-ink">
                {t('openTask')}
              </Link>
            ) : null}
            {entry.pending ? <span className="text-meta text-ink-3">{t('waiting')}</span> : null}
          </div>
          {entry.pending ? null : (
            <div className="flex shrink-0 items-center gap-1">
              {entry.taskId ? null : (
                <Button type="button" variant="ghost" onClick={() => void onToTask(entry.id)}>
                  {t('toTask')}
                </Button>
              )}
              <IconButton label={t('archive')} onClick={() => void onArchive(entry.id)}>
                <Archive size={20} aria-hidden="true" />
              </IconButton>
            </div>
          )}
        </li>
      ))}
    </ul>
  )
}
