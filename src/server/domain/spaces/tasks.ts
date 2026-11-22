import type { Task } from '../../../shared/schemas/task.ts'
import type { Tx } from '../../db.ts'
import { TASK_COLUMNS, toTask, type TaskRow } from '../tasks/tasks.ts'
import { SpaceError } from './spaces.ts'

/**
 * The tasks of one shared space (PRD F13): with `unassigned` only what nobody took yet, with `all`
 * everything open. RLS already limits the space to the person's own spaces.
 */
export async function listSpaceTasks(tx: Tx, spaceId: string, filter: 'unassigned' | 'all'): Promise<Task[]> {
  const [space] = await tx<{ id: string }[]>`
    select s.id from space s join space_member m on m.space_id = s.id and m.user_id = app.uid()
     where s.id = ${spaceId}`
  if (!space) throw new SpaceError(404, 'not_found')

  const rows = await tx.unsafe<TaskRow[]>(
    `select ${TASK_COLUMNS} from task
      where space_id = $1 and status in ('todo', 'doing', 'waiting')
        and ($2 = 'all' or assignee_id is null)
      order by do_date nulls last, position, created_at`,
    [spaceId, filter],
  )
  return rows.map(toTask)
}
