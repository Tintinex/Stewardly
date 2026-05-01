import * as r from '../../../shared/response'
import * as repo from '../repository'

/** PATCH /api/finances/transactions/:transactionId */
export async function handleUpdateTransaction(
  body: string | null,
  hoaId: string,
  transactionId: string,
  role: string,
): Promise<r.ApiResponse> {
  if (role !== 'board_admin' && role !== 'board_member') {
    return r.forbidden('Only board members can edit transactions')
  }
  if (!body) return r.badRequest('Request body is required')

  let parsed: { description?: string; vendor?: string; category?: string; notes?: string }
  try {
    parsed = JSON.parse(body)
  } catch {
    return r.badRequest('Invalid JSON')
  }

  const txn = await repo.updateTransaction(hoaId, transactionId, parsed)
  if (!txn) return r.notFound('Transaction not found')
  return r.ok(txn)
}
