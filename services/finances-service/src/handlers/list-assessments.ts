import type { LambdaEvent } from '../../../shared/types'
import * as r from '../../../shared/response'
import * as repo from '../repository'

/** GET /api/finances/assessments[?status=pending|paid|overdue|all] */
export async function handleListAssessments(event: LambdaEvent, hoaId: string): Promise<r.ApiResponse> {
  const status = event.queryStringParameters?.status ?? 'all'
  await repo.markAssessmentsPastDue(hoaId)
  const assessments = await repo.listAssessments(hoaId, status)
  return r.ok({ assessments })
}
