import * as r from '../../../shared/response'
import * as repo from '../repository'
import { parseCreateInput } from '../validators'

/** POST /api/tasks */
export async function handleCreate(body: string | null, hoaId: string, userId: string): Promise<r.ApiResponse> {
  if (!body) return r.badRequest('Request body is required')

  const input = parseCreateInput(JSON.parse(body))
  if (typeof input === 'string') return r.badRequest(input)

  const task = await repo.createTask(hoaId, userId, input)
  return r.created(task)
}
