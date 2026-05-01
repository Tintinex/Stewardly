import * as r from '../../../shared/response'
import * as repo from '../repository'

/** GET /api/finances/analytics */
export async function handleGetAnalytics(hoaId: string): Promise<r.ApiResponse> {
  const analytics = await repo.getAnalytics(hoaId)
  return r.ok(analytics)
}
