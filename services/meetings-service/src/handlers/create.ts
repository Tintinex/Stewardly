import * as r from '../../../shared/response'
import * as repo from '../repository'
import { parseCreateInput } from '../validators'

/** POST /api/meetings */
export async function handleCreate(body: string | null, hoaId: string, userId: string, role: string): Promise<r.ApiResponse> {
  if (role === 'homeowner') return r.forbidden('Only board members can schedule meetings')
  if (!body) return r.badRequest('Request body is required')

  const input = parseCreateInput(JSON.parse(body))
  if (typeof input === 'string') return r.badRequest(input)

  const meeting = await repo.createMeeting(hoaId, userId, input)
  if (!meeting) return r.serverError('Failed to create meeting')
  return r.created(meeting)
}
