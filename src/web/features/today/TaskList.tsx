import { useTranslation } from 'react-i18next'
import type { Task } from '../../../shared/schemas/task.ts'
import { TaskRow } from '../tasks/TaskRow.tsx'

export type TaskListProps = {
  heading: string
  tasks: Task[]
  today: string
  onToggle: (task: Task) => void
  onOpen: (task: Task) => void
}

/** One section of the day (Must, Block 1–4). Empty sections stay hidden (DESIGN §5). */
export function TaskList({ heading, tasks, today, onToggle, onOpen }: TaskListProps) {
  if (tasks.length === 0) return null

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-heading">{heading}</h2>
      <ul className="flex flex-col">
        {tasks.map((task) => (
          <TaskRow key={task.id} task={task} today={today} onToggle={onToggle} onOpen={onOpen} />
        ))}
      </ul>
    </section>
  )
}
