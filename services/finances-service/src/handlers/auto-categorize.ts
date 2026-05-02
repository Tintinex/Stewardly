import * as r from '../../../shared/response'
import * as repo from '../repository'

/**
 * POST /api/finances/transactions/auto-categorize
 * Re-categorizes all transactions currently labelled 'Other' using keyword inference.
 * Returns { updated: number } — the count of transactions that received a new category.
 */
export async function handleAutoCategorize(hoaId: string, role: string): Promise<r.ApiResponse> {
  if (role !== 'board_admin' && role !== 'board_member') {
    return r.forbidden('Only board members can auto-categorize transactions')
  }

  const updated = await repo.autoCategorizeTransactions(hoaId)
  return r.ok({ updated })
}
