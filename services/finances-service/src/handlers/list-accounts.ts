import * as r from '../../../shared/response'
import * as repo from '../repository'

/** GET /api/finances/accounts */
export async function handleListAccounts(hoaId: string): Promise<r.ApiResponse> {
  const accounts = await repo.listAccounts(hoaId)
  return r.ok({ accounts })
}
