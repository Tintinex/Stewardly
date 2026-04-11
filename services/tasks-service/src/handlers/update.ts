import * as r from '../../../shared/response'
import * as repo from '../repository'
import { parseUpdateInput } from '../validators'

/** PATCH /api/tasks/{taskId} */
export async function handleUpdate(body: string | null, hoaId: string, taskId: string): Promise<r.ApiResponse> {
  if (!body) return r.badRequest('Request body is required')

  const input = parseUpdateInput(JSON.parse(body))
  if (typeof input === 'string') return r.badRequest(input)

  const existing = await repo.getTask(hoaId, taskId)
  if (!existing) return r.notFound('Task')

  const updated = await repo.updateTask(hoaId, taskId, input)
  return r.ok(updated)
}
