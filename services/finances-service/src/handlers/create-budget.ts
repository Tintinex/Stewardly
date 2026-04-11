import * as r from '../../../shared/response'
import * as repo from '../repository'

/** POST /api/finances/budgets */
export async function handleCreateBudget(body: string | null, hoaId: string, role: string): Promise<r.ApiResponse> {
  if (role !== 'board_admin' && role !== 'board_member') {
    return r.forbidden('Only board members can manage budgets')
  }
  if (!body) return r.badRequest('Request body is required')

  const parsed = JSON.parse(body) as { fiscalYear?: number; totalAmount?: number }
  if (!parsed.fiscalYear) return r.badRequest('fiscalYear is required')
  if (!parsed.totalAmount) return r.badRequest('totalAmount is required')

  await repo.upsertBudget(hoaId, parsed.fiscalYear, parsed.totalAmount)
  return r.created({ message: 'Budget created/updated successfully' })
}
