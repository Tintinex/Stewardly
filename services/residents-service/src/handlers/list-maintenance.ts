import * as r from '../../../shared/response'
import * as repo from '../repository'

/** GET /api/maintenance-requests */
export async function handleListMaintenance(hoaId: string, userId: string, role: string): Promise<r.ApiResponse> {
  const requests = await repo.getMaintenanceRequests(hoaId, userId, role)
  return r.ok(requests)
}
