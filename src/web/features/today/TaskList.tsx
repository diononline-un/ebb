import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import type { Task } from '../../../shared/schemas/task.ts'
import { SortableTaskRow } from './SortableTaskRow.tsx'
import type { MoveTarget } from './MoveMenu.tsx'

export type TaskListProps = {
  heading: string
  tasks: Task[]
  today: string
  onToggle: (task: Task) => void
  onOpen: (task: Task) => void
  onMove: (taskId: string, target: MoveTarget) => void
}

/** One section of the day (Inbox, Must, Block 1–4). Empty sections stay hidden (DESIGN §5). */
export function TaskList({ heading, tasks, today, onToggle, onOpen, onMove }: TaskListProps) {
  if (tasks.length === 0) return null

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-heading">{heading}</h2>
      <SortableContext items={tasks.map((task) => task.id)} strategy={verticalListSortingStrategy}>
        <ul className="flex flex-col">
          {tasks.map((task) => (
            <SortableTaskRow
              key={task.id}
              task={task}
              today={today}
              onToggle={onToggle}
              onOpen={onOpen}
              onMove={onMove}
            />
          ))}
        </ul>
      </SortableContext>
    </section>
  )
}
