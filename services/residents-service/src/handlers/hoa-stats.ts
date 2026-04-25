import * as r from '../../../shared/response'
import { getHoaStats } from '../repository'

/** GET /api/hoa/stats — dashboard stats for board_admin/board_member */
export async function handleHoaStats(hoaId: string): Promise<r.ApiResponse> {
  const stats = await getHoaStats(hoaId)
  return r.ok(stats)
}
