import * as r from '../../../shared/response'
import * as repo from '../repository'

/** GET /api/finances/budget[?year=2025] */
export async function handleGetBudget(hoaId: string, year?: string): Promise<r.ApiResponse> {
  const fiscalYear = year ? parseInt(year, 10) : undefined
  if (year && isNaN(fiscalYear!)) return r.badRequest('Invalid year parameter')

  const [budget, years] = await Promise.all([
    repo.getBudget(hoaId, fiscalYear),
    repo.listBudgetYears(hoaId),
  ])

  return r.ok({ budget, availableYears: years })
}
