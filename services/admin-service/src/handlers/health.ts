import * as r from '../../../shared/response'
import { getHoaHealth } from '../repository'

/** GET /api/admin/hoas/:hoaId/health */
export async function handleGetHoaHealth(hoaId: string): Promise<r.ApiResponse> {
  const health = await getHoaHealth(hoaId)
  return r.ok(health)
}
