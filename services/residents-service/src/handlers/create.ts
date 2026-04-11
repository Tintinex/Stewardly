import * as r from '../../../shared/response'
import * as repo from '../repository'
import { parseCreateInput } from '../validators'

/** POST /api/residents */
export async function handleCreate(body: string | null, hoaId: string, userId: string, role: string): Promise<r.ApiResponse> {
  if (role === 'homeowner') return r.forbidden('Only board members can add residents')
  if (!body) return r.badRequest('Request body is required')

  const input = parseCreateInput(JSON.parse(body))
  if (typeof input === 'string') return r.badRequest(input)

  const unit = await repo.findUnit(hoaId, input.unitNumber)
  const resident = await repo.createResident(hoaId, input, unit?.id ?? null)
  if (!resident) return r.serverError('Failed to create resident')

  // Log addition without PII — only IDs
  console.log(`[residents-service] Resident created: id=${resident.id}, hoaId=${hoaId}, createdBy=${userId}`)

  return r.created(resident)
}
