import * as r from '../../../shared/response'
import * as repo from '../repository'
import { getPlaidClient } from '../plaid-client'

/** GET /api/finances/plaid/items */
export async function handleListPlaidItems(hoaId: string): Promise<r.ApiResponse> {
  const items = await repo.getPlaidItems(hoaId)
  return r.ok({ items })
}

/** DELETE /api/finances/plaid/items/:itemId */
export async function handleDeletePlaidItem(
  hoaId: string,
  plaidItemId: string,
  role: string,
): Promise<r.ApiResponse> {
  if (role !== 'board_admin' && role !== 'board_member') {
    return r.forbidden('Only board members can disconnect bank accounts')
  }

  const item = await repo.getPlaidItemWithToken(hoaId, plaidItemId)
  if (!item) return r.notFound('Plaid item not found')

  // Tell Plaid to revoke access (best-effort — don't fail if Plaid errors)
  try {
    const plaid = await getPlaidClient()
    await plaid.itemRemove({ access_token: item.accessToken })
  } catch (err) {
    console.warn('[plaid-items] Plaid itemRemove failed (non-fatal):', err)
  }

  const deleted = await repo.deletePlaidItem(hoaId, plaidItemId)
  if (!deleted) return r.notFound('Plaid item not found')

  return r.ok({ message: 'Bank connection removed' })
}
