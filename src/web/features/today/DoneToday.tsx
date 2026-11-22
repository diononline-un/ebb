import { useTranslation } from 'react-i18next'
import type { Task } from '../../../shared/schemas/task.ts'
import { TaskRow } from '../tasks/TaskRow.tsx'

export type DoneTodayProps = {
  tasks: Task[]
  today: string
  onToggle: (task: Task) => void
  onOpen: (task: Task) => void
}

/** Folded away by default: the finished part of the day should not compete with the rest (DESIGN §5). */
export function DoneToday({ tasks, today, onToggle, onOpen }: DoneTodayProps) {
  const { t } = useTranslation('today')
  if (tasks.length === 0) return null

  return (
    <details className="flex flex-col gap-2">
      <summary className="min-h-11 cursor-pointer py-2 text-heading">
        {t('doneHeading', { count: tasks.length })}
      </summary>
      <ul className="flex flex-col">
        {tasks.map((task) => (
          <TaskRow key={task.id} task={task} today={today} onToggle={onToggle} onOpen={onOpen} />
        ))}
      </ul>
    </details>
  )
}
