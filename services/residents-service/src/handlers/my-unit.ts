import * as r from '../../../shared/response'
import * as repo from '../repository'

/** GET /api/my-unit — returns the current user's unit + recent assessments */
export async function handleMyUnit(hoaId: string, userId: string): Promise<r.ApiResponse> {
  const result = await repo.getMyUnit(hoaId, userId)
  if (!result) return r.notFound('Unit')

  return r.ok(result)
}
