import * as r from '../../../shared/response'
import * as repo from '../repository'
import { parseUpdateInput } from '../validators'

/** PATCH /api/residents/{residentId} */
export async function handleUpdate(body: string | null, hoaId: string, residentId: string, userId: string, role: string): Promise<r.ApiResponse> {
  // Homeowners can only update their own profile
  if (role === 'homeowner' && residentId !== userId) {
    return r.forbidden('Homeowners can only update their own profile')
  }
  if (!body) return r.badRequest('Request body is required')

  const input = parseUpdateInput(JSON.parse(body))
  if (typeof input === 'string') return r.badRequest(input)

  const existing = await repo.getResident(hoaId, residentId)
  if (!existing) return r.notFound('Resident')

  const updated = await repo.updateResident(hoaId, residentId, input, role)
  return r.ok(updated)
}
