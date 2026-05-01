import * as r from '../../../shared/response'
import * as repo from '../repository'
import type { CreateTransactionInput } from '../types'

/** POST /api/finances/transactions */
export async function handleCreateTransaction(body: string | null, hoaId: string, role: string): Promise<r.ApiResponse> {
  if (role !== 'board_admin' && role !== 'board_member') {
    return r.forbidden('Only board members can add transactions')
  }
  if (!body) return r.badRequest('Request body is required')

  let parsed: CreateTransactionInput
  try {
    parsed = JSON.parse(body) as CreateTransactionInput
  } catch {
    return r.badRequest('Invalid JSON')
  }

  if (!parsed.accountId) return r.badRequest('accountId is required')
  if (typeof parsed.amount !== 'number' || parsed.amount <= 0) return r.badRequest('amount must be a positive number')
  if (!parsed.description?.trim()) return r.badRequest('description is required')
  if (!parsed.category?.trim()) return r.badRequest('category is required')
  if (!parsed.date) return r.badRequest('date is required')
  if (!['debit', 'credit'].includes(parsed.type)) return r.badRequest('type must be debit or credit')

  const txn = await repo.createTransaction(hoaId, parsed)
  return r.created(txn)
}
