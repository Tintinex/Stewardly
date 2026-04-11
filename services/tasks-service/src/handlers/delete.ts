import * as r from '../../../shared/response'
import * as repo from '../repository'

/** DELETE /api/tasks/{taskId} */
export async function handleDelete(hoaId: string, taskId: string, role: string): Promise<r.ApiResponse> {
  // Only board members and admins can delete tasks
  if (role === 'homeowner') return r.forbidden('Only board members can delete tasks')

  const existing = await repo.getTask(hoaId, taskId)
  if (!existing) return r.notFound('Task')

  await repo.deleteTask(hoaId, taskId)
  return r.noContent()
}
