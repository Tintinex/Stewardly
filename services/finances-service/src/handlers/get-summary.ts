import * as r from '../../../shared/response'
import * as repo from '../repository'

/** GET /api/finances */
export async function handleGetSummary(hoaId: string): Promise<r.ApiResponse> {
  const summary = await repo.getFinancialSummary(hoaId)
  return r.ok(summary)
}
