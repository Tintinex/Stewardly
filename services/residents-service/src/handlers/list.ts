import * as r from '../../../shared/response'
import * as repo from '../repository'
import type { Resident } from '../types'

/** GET /api/residents */
export async function handleList(hoaId: string, userId: string, role: string): Promise<r.ApiResponse> {
  const residents = await repo.listResidents(hoaId)

  // Homeowners see masked PII for other residents
  if (role === 'homeowner') {
    return r.ok(residents.map((res: Resident) => ({
      ...res,
      email: res.id === userId ? res.email : res.email.replace(/(.{2}).*(@)/, '$1***$2'),
      phone: res.id === userId ? res.phone : null,
    })))
  }

  return r.ok(residents)
}
