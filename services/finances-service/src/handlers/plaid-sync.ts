import * as r from '../../../shared/response'
import * as repo from '../repository'
import { getPlaidClient } from '../plaid-client'
import { syncTransactions } from './plaid-exchange'

/** POST /api/finances/plaid/sync/:itemId — pull latest transactions from Plaid */
export async function handlePlaidSync(
  hoaId: string,
  plaidItemId: string,
  role: string,
): Promise<r.ApiResponse> {
  if (role !== 'board_admin' && role !== 'board_member') {
    return r.forbidden('Only board members can sync transactions')
  }

  const item = await repo.getPlaidItemWithToken(hoaId, plaidItemId)
  if (!item) return r.notFound('Plaid item not found')

  if (item.status === 'item_login_required') {
    return r.badRequest('This account requires re-authentication. Please reconnect it via Plaid Link.')
  }

  const plaid = await getPlaidClient()

  try {
    const result = await syncTransactions(
      hoaId,
      item.id,
      item.accessToken,
      item.cursor,
      plaid,
    )

    await repo.updatePlaidItemCursor(item.id, result.nextCursor)

    return r.ok({
      itemId: item.id,
      institutionName: item.institutionName,
      added: result.added,
      modified: result.modified,
      removed: result.removed,
    })
  } catch (err: unknown) {
    const plaidError = (err as { response?: { data?: { error_code?: string; error_type?: string } } })?.response?.data
    if (plaidError?.error_type === 'ITEM_ERROR') {
      const errorCode = plaidError.error_code ?? 'ITEM_ERROR'
      const status = errorCode === 'ITEM_LOGIN_REQUIRED' ? 'item_login_required' : 'error'
      await repo.updatePlaidItemStatus(item.id, status, errorCode)
      return r.badRequest(`Plaid sync failed: ${errorCode}. Please reconnect this account.`)
    }
    throw err
  }
}
