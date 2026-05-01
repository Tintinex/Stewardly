import * as r from '../../../shared/response'
import * as repo from '../repository'

/** DELETE /api/finances/transactions/:transactionId */
export async function handleDeleteTransaction(
  hoaId: string,
  transactionId: string,
  role: string,
): Promise<r.ApiResponse> {
  if (role !== 'board_admin' && role !== 'board_member') {
    return r.forbidden('Only board members can delete transactions')
  }

  const deleted = await repo.deleteTransaction(hoaId, transactionId)
  if (!deleted) return r.notFound('Transaction not found')
  return r.ok({ message: 'Transaction deleted' })
}
