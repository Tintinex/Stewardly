import { query, queryOne, execute, param } from '../../shared/db/client'
import type { Task, CreateTaskInput, UpdateTaskInput } from './types'

/** Resolve a Cognito sub to the owner's DB id within an HOA. */
async function resolveOwnerId(hoaId: string, cognitoSub: string): Promise<string | null> {
  const row = await queryOne<{ id: string }>(
    'SELECT id FROM owners WHERE hoa_id = :hoaId AND cognito_sub = :cognitoSub LIMIT 1',
    [param.string('hoaId', hoaId), param.string('cognitoSub', cognitoSub)],
  )
  return row?.id ?? null
}

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
  // userId is the Cognito sub — resolve to the owner's DB id for the FK constraint
  const ownerId = await resolveOwnerId(hoaId, userId)
  if (!ownerId) throw new Error(`No owner record found for user ${userId} in HOA ${hoaId}`)

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
      param.string('createdById', ownerId),
    ],
  )
  // Fetch the row we just inserted
  return queryOne<Task>(
    `${TASK_SELECT}
     WHERE t.hoa_id = :hoaId AND t.created_by_id = :ownerId
     ORDER BY t.created_at DESC LIMIT 1`,
    [param.string('hoaId', hoaId), param.string('ownerId', ownerId)],
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
