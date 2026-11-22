import { Clock } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { addDays, isBefore } from '../../../shared/day.ts'
import type { Task } from '../../../shared/schemas/task.ts'
import { Checkbox } from '../../ui/Checkbox.tsx'
import { cn } from '../../lib/cn.ts'

export type TaskRowProps = {
  task: Task
  /** The user's day, for the "due soon" line and the pushed counter. */
  today: string
  onToggle: (task: Task) => void
  onOpen: (task: Task) => void
  /** Only Plan and the weekly reset show "↻ 3×" (DESIGN §6); Today never does. */
  showPushCount?: boolean
}

/** DESIGN §6: checkbox, optional must dot, title, then a quiet meta line. */
export function TaskRow({ task, today, onToggle, onOpen, showPushCount = false }: TaskRowProps) {
  const { t, i18n } = useTranslation('tasks')
  const done = task.status === 'done'
  const dueSoon = task.deadline !== null && !done && isBefore(task.deadline, addDays(today, 3))
  // Calendar days are read in UTC so the label never slips to the day before (E2 review note).
  const deadlineLabel = task.deadline
    ? new Intl.DateTimeFormat(i18n.language, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(
        new Date(`${task.deadline}T00:00:00Z`),
      )
    : ''

  return (
    <li className="flex min-h-13 items-start gap-1 border-b border-line py-1 last:border-b-0">
      <Checkbox
        checked={done}
        onCheckedChange={() => onToggle(task)}
        aria-label={t(done ? 'markOpen' : 'markDone', { title: task.title })}
      />
      <button
        type="button"
        onClick={() => onOpen(task)}
        className="flex min-h-11 flex-1 flex-col items-start gap-1 py-2 text-left motion-quick hover:text-ink-2"
      >
        <span className="flex items-center gap-2">
          {task.must && !done ? (
            <>
              <span aria-hidden="true" className="size-2 shrink-0 rounded-pill bg-ink" />
              <span className="sr-only">{t('must')}</span>
            </>
          ) : null}
          <span className={cn('text-body break-words', done ? 'text-ink-3 line-through' : 'text-ink')}>
            {task.title}
          </span>
        </span>
        {dueSoon || (showPushCount && task.pushCount >= 2) ? (
          <span className="flex items-center gap-1 text-meta text-ink-3">
            {dueSoon ? (
              <>
                <Clock size={16} aria-hidden="true" className="text-warn" />
                <span className="text-warn">{t('deadlineSoon', { date: deadlineLabel })}</span>
              </>
            ) : null}
            {showPushCount && task.pushCount >= 2 ? <span>{t('pushed', { count: task.pushCount })}</span> : null}
          </span>
        ) : null}
      </button>
    </li>
  )
}
