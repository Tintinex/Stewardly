import * as r from '../../../shared/response'
import * as repo from '../repository'

/** GET /api/my-unit — returns the current user's profile, unit (if assigned), assessments, and HOA details */
export async function handleMyUnit(hoaId: string, userId: string): Promise<r.ApiResponse> {
  const result = await repo.getMyUnit(hoaId, userId)
  // Owner record not found in DB (token valid but owner not yet created via /residents/me)
  if (!result) return r.notFound('Owner')

  return r.ok(result)
}
