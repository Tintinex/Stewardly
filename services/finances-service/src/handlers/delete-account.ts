import * as r from '../../../shared/response'
import * as repo from '../repository'

/** DELETE /api/finances/accounts/:accountId */
export async function handleDeleteAccount(hoaId: string, accountId: string, role: string): Promise<r.ApiResponse> {
  if (role !== 'board_admin' && role !== 'board_member') {
    return r.forbidden('Only board members can delete accounts')
  }

  const deleted = await repo.deleteAccount(hoaId, accountId)
  if (!deleted) {
    return r.badRequest('Cannot delete an account that has transactions. Remove transactions first or archive the account.')
  }
  return r.ok({ message: 'Account deleted' })
}
