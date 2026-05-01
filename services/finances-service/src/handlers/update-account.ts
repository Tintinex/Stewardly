import * as r from '../../../shared/response'
import * as repo from '../repository'

/** PATCH /api/finances/accounts/:accountId */
export async function handleUpdateAccount(body: string | null, hoaId: string, accountId: string, role: string): Promise<r.ApiResponse> {
  if (role !== 'board_admin' && role !== 'board_member') {
    return r.forbidden('Only board members can update accounts')
  }
  if (!body) return r.badRequest('Request body is required')

  let parsed: { accountName?: string; institutionName?: string; accountType?: string; balance?: number }
  try {
    parsed = JSON.parse(body)
  } catch {
    return r.badRequest('Invalid JSON')
  }

  const account = await repo.updateAccount(hoaId, accountId, parsed)
  if (!account) return r.notFound('Account not found')
  return r.ok(account)
}
