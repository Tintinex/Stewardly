import type { APIGatewayProxyEventV2WithLambdaAuthorizer } from 'aws-lambda'
import { query, queryOne, execute, param } from '../shared/db/client'
import * as r from '../shared/response'

interface AuthorizerContext {
  hoaId: string
  userId: string
  role: string
}

type TaskEvent = APIGatewayProxyEventV2WithLambdaAuthorizer<AuthorizerContext>

interface Task {
  id: string
  hoaId: string
  title: string
  description: string | null
  status: string
  priority: string
  assigneeId: string | null
  assigneeName: string | null
  dueDate: string | null
  createdById: string
  createdAt: string
  updatedAt: string
}

export const handler = async (event: TaskEvent) => {
  // Extract hoaId from authorizer context — NEVER from request body or query params
  const hoaId = event.requestContext.authorizer.lambda.hoaId
  const userId = event.requestContext.authorizer.lambda.userId
  const role = event.requestContext.authorizer.lambda.role

  if (!hoaId) return r.unauthorized()

  const method = event.requestContext.http.method
  const path = event.requestContext.http.path
  const taskId = event.pathParameters?.taskId

  try {
    // GET /api/tasks
    if (method === 'GET' && !taskId) {
      const tasks = await query<Task>(
        `SELECT t.*, CONCAT(u.first_name, ' ', u.last_name) as assignee_name
         FROM tasks t
         LEFT JOIN owners u ON u.id = t.assignee_id
         WHERE t.hoa_id = :hoaId
         ORDER BY
           CASE t.status WHEN 'in_progress' THEN 1 WHEN 'todo' THEN 2 ELSE 3 END,
           CASE t.priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
           t.created_at DESC`,
        [param.string('hoaId', hoaId)],
      )
      return r.ok(tasks)
    }

    // POST /api/tasks
    if (method === 'POST') {
      if (!event.body) return r.badRequest('Request body is required')
      const body = JSON.parse(event.body) as {
        title?: string
        description?: string
        priority?: string
        assigneeId?: string
        dueDate?: string
      }

      if (!body.title?.trim()) return r.badRequest('title is required')
      const validPriorities = ['low', 'medium', 'high']
      if (body.priority && !validPriorities.includes(body.priority)) {
        return r.badRequest('priority must be low, medium, or high')
      }

      await execute(
        `INSERT INTO tasks (id, hoa_id, title, description, status, priority, assignee_id, due_date, created_by_id)
         VALUES (gen_random_uuid(), :hoaId, :title, :description, 'todo', :priority, :assigneeId, :dueDate, :createdById)`,
        [
          param.string('hoaId', hoaId),
          param.string('title', body.title.trim()),
          param.stringOrNull('description', body.description ?? null),
          param.string('priority', body.priority ?? 'medium'),
          param.stringOrNull('assigneeId', body.assigneeId ?? null),
          param.stringOrNull('dueDate', body.dueDate ?? null),
          param.string('createdById', userId),
        ],
      )

      const created = await queryOne<Task>(
        `SELECT t.*, CONCAT(u.first_name, ' ', u.last_name) as assignee_name
         FROM tasks t
         LEFT JOIN owners u ON u.id = t.assignee_id
         WHERE t.hoa_id = :hoaId AND t.created_by_id = :userId
         ORDER BY t.created_at DESC LIMIT 1`,
        [param.string('hoaId', hoaId), param.string('userId', userId)],
      )
      return r.created(created)
    }

    // PATCH /api/tasks/{taskId}
    if (method === 'PATCH' && taskId) {
      if (!event.body) return r.badRequest('Request body is required')
      const body = JSON.parse(event.body) as {
        title?: string
        description?: string
        status?: string
        priority?: string
        assigneeId?: string
        dueDate?: string
      }

      const validStatuses = ['todo', 'in_progress', 'done']
      const validPriorities = ['low', 'medium', 'high']

      if (body.status && !validStatuses.includes(body.status)) {
        return r.badRequest(`status must be one of: ${validStatuses.join(', ')}`)
      }
      if (body.priority && !validPriorities.includes(body.priority)) {
        return r.badRequest(`priority must be one of: ${validPriorities.join(', ')}`)
      }

      // Check the task belongs to this HOA
      const existing = await queryOne<Task>(
        'SELECT id FROM tasks WHERE id = :taskId AND hoa_id = :hoaId',
        [param.string('taskId', taskId), param.string('hoaId', hoaId)],
      )
      if (!existing) return r.notFound('Task')

      const setParts: string[] = ['updated_at = NOW()']
      const params = [
        param.string('taskId', taskId),
        param.string('hoaId', hoaId),
      ]

      if (body.title !== undefined) {
        setParts.push('title = :title')
        params.push(param.string('title', body.title))
      }
      if (body.description !== undefined) {
        setParts.push('description = :description')
        params.push(param.stringOrNull('description', body.description))
      }
      if (body.status !== undefined) {
        setParts.push('status = :status')
        params.push(param.string('status', body.status))
      }
      if (body.priority !== undefined) {
        setParts.push('priority = :priority')
        params.push(param.string('priority', body.priority))
      }
      if (body.assigneeId !== undefined) {
        setParts.push('assignee_id = :assigneeId')
        params.push(param.stringOrNull('assigneeId', body.assigneeId))
      }
      if (body.dueDate !== undefined) {
        setParts.push('due_date = :dueDate')
        params.push(param.stringOrNull('dueDate', body.dueDate))
      }

      await execute(
        `UPDATE tasks SET ${setParts.join(', ')} WHERE id = :taskId AND hoa_id = :hoaId`,
        params,
      )

      const updated = await queryOne<Task>(
        `SELECT t.*, CONCAT(u.first_name, ' ', u.last_name) as assignee_name
         FROM tasks t
         LEFT JOIN owners u ON u.id = t.assignee_id
         WHERE t.id = :taskId AND t.hoa_id = :hoaId`,
        [param.string('taskId', taskId), param.string('hoaId', hoaId)],
      )
      return r.ok(updated)
    }

    // DELETE /api/tasks/{taskId}
    if (method === 'DELETE' && taskId) {
      // Only board members / admins can delete tasks
      if (role === 'homeowner') return r.forbidden('Only board members can delete tasks')

      const existing = await queryOne<Task>(
        'SELECT id FROM tasks WHERE id = :taskId AND hoa_id = :hoaId',
        [param.string('taskId', taskId), param.string('hoaId', hoaId)],
      )
      if (!existing) return r.notFound('Task')

      await execute(
        'DELETE FROM tasks WHERE id = :taskId AND hoa_id = :hoaId',
        [param.string('taskId', taskId), param.string('hoaId', hoaId)],
      )
      return r.noContent()
    }

    return r.badRequest(`Unsupported method/path: ${method} ${path}`)
  } catch (err) {
    console.error('Tasks handler error:', err)
    return r.serverError()
  }
}
