import { useSortable } from '@dnd-kit/sortable'
import { GripVertical } from 'lucide-react'
import type { CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import type { Task } from '../../../shared/schemas/task.ts'
import { IconButton } from '../../ui/IconButton.tsx'
import { TaskRow } from '../tasks/TaskRow.tsx'
import { MoveMenu, type MoveTarget } from './MoveMenu.tsx'

export type SortableTaskRowProps = {
  task: Task
  today: string
  onToggle: (task: Task) => void
  onOpen: (task: Task) => void
  onMove: (taskId: string, target: MoveTarget) => void
}

/**
 * A task row that can be dragged with the grip (desktop) or by holding it for 250 ms (touch),
 * and moved through the menu without a pointer at all.
 */
export function SortableTaskRow({ task, today, onToggle, onOpen, onMove }: SortableTaskRowProps) {
  const { t } = useTranslation('today')
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id })

  const style: CSSProperties | undefined = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, transition: transition ?? undefined }
    : undefined

  return (
    <TaskRow
      task={task}
      today={today}
      onToggle={onToggle}
      onOpen={onOpen}
      rowRef={setNodeRef}
      rowStyle={style}
      dragging={isDragging}
      trailing={
        <div className="flex shrink-0 items-center">
          <IconButton label={t('move.grab', { title: task.title })} className="touch-none" {...attributes} {...listeners}>
            <GripVertical size={20} aria-hidden="true" />
          </IconButton>
          <MoveMenu taskTitle={task.title} onMove={(target) => onMove(task.id, target)} />
        </div>
      }
    />
  )
}
