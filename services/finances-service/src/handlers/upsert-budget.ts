import * as r from '../../../shared/response'
import * as repo from '../repository'
import type { CreateBudgetInput } from '../types'

/** POST /api/finances/budget */
export async function handleUpsertBudget(body: string | null, hoaId: string, role: string): Promise<r.ApiResponse> {
  if (role !== 'board_admin' && role !== 'board_member') {
    return r.forbidden('Only board members can manage budgets')
  }
  if (!body) return r.badRequest('Request body is required')

  let parsed: CreateBudgetInput
  try {
    parsed = JSON.parse(body) as CreateBudgetInput
  } catch {
    return r.badRequest('Invalid JSON')
  }

  if (!parsed.fiscalYear || typeof parsed.fiscalYear !== 'number') return r.badRequest('fiscalYear is required')
  if (!Array.isArray(parsed.lineItems) || parsed.lineItems.length === 0) return r.badRequest('lineItems array is required')

  for (const item of parsed.lineItems) {
    if (!item.category?.trim()) return r.badRequest('Each line item must have a category')
    if (typeof item.budgetedAmount !== 'number' || item.budgetedAmount < 0) return r.badRequest(`Invalid budgetedAmount for category: ${item.category}`)
  }

  const budget = await repo.upsertBudgetWithLineItems(hoaId, parsed)
  return r.ok(budget)
}

/** POST /api/finances/budget/:budgetId/approve */
export async function handleApproveBudget(budgetId: string, hoaId: string, role: string): Promise<r.ApiResponse> {
  if (role !== 'board_admin') return r.forbidden('Only board admin can approve budgets')
  await repo.approveBudget(hoaId, budgetId)
  return r.ok({ message: 'Budget approved' })
}
