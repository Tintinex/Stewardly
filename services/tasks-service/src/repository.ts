import { query, queryOne, execute, param } from '../../shared/db/client'
import type { Task, CreateTaskInput, UpdateTaskInput } from './types'

const TASK_SELECT = `
  SELECT t.*, CONCAT(u.first_name, ' ', u.last_name) AS assignee_name
  FROM tasks t
  LEFT JOIN owners u ON u.id = t.assignee_id`

export async function listTasks(hoaId: string): Promise<Task[]> {
  return query<Task>(
    `${TASK_SELECT}
     WHERE t.hoa_id = :hoaId
     ORDER BY
       CASE t.status WHEN 'in_progress' THEN 1 WHEN 'todo' THEN 2 ELSE 3 END,
       CASE t.priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
       t.created_at DESC`,
    [param.string('hoaId', hoaId)],
  )
}

export async function getTask(hoaId: string, taskId: string): Promise<Task | null> {
  return queryOne<Task>(
    `${TASK_SELECT} WHERE t.id = :taskId AND t.hoa_id = :hoaId`,
    [param.string('taskId', taskId), param.string('hoaId', hoaId)],
  )
}

export async function createTask(hoaId: string, userId: string, input: CreateTaskInput): Promise<Task | null> {
  await execute(
    `INSERT INTO tasks (id, hoa_id, title, description, status, priority, assignee_id, due_date, created_by_id)
     VALUES (gen_random_uuid(), :hoaId, :title, :description, 'todo', :priority, :assigneeId, :dueDate, :createdById)`,
    [
      param.string('hoaId', hoaId),
      param.string('title', input.title),
      param.stringOrNull('description', input.description),
      param.string('priority', input.priority),
      param.stringOrNull('assigneeId', input.assigneeId),
      param.stringOrNull('dueDate', input.dueDate),
      param.string('createdById', userId),
    ],
  )
  // Fetch the row we just inserted
  return queryOne<Task>(
    `${TASK_SELECT}
     WHERE t.hoa_id = :hoaId AND t.created_by_id = :userId
     ORDER BY t.created_at DESC LIMIT 1`,
    [param.string('hoaId', hoaId), param.string('userId', userId)],
  )
}

export async function updateTask(hoaId: string, taskId: string, input: UpdateTaskInput): Promise<Task | null> {
  const setParts: string[] = ['updated_at = NOW()']
  const params = [param.string('taskId', taskId), param.string('hoaId', hoaId)]

  if (input.title !== undefined) { setParts.push('title = :title'); params.push(param.string('title', input.title)) }
  if (input.description !== undefined) { setParts.push('description = :description'); params.push(param.stringOrNull('description', input.description)) }
  if (input.status !== undefined) { setParts.push('status = :status'); params.push(param.string('status', input.status)) }
  if (input.priority !== undefined) { setParts.push('priority = :priority'); params.push(param.string('priority', input.priority)) }
  if (input.assigneeId !== undefined) { setParts.push('assignee_id = :assigneeId'); params.push(param.stringOrNull('assigneeId', input.assigneeId)) }
  if (input.dueDate !== undefined) { setParts.push('due_date = :dueDate'); params.push(param.stringOrNull('dueDate', input.dueDate)) }

  await execute(
    `UPDATE tasks SET ${setParts.join(', ')} WHERE id = :taskId AND hoa_id = :hoaId`,
    params,
  )
  return getTask(hoaId, taskId)
}

export async function deleteTask(hoaId: string, taskId: string): Promise<void> {
  await execute(
    'DELETE FROM tasks WHERE id = :taskId AND hoa_id = :hoaId',
    [param.string('taskId', taskId), param.string('hoaId', hoaId)],
  )
}
