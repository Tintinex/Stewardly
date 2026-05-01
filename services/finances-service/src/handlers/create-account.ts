import * as r from '../../../shared/response'
import * as repo from '../repository'
import type { CreateAccountInput } from '../types'

/** POST /api/finances/accounts */
export async function handleCreateAccount(body: string | null, hoaId: string, role: string): Promise<r.ApiResponse> {
  if (role !== 'board_admin' && role !== 'board_member') {
    return r.forbidden('Only board members can add accounts')
  }
  if (!body) return r.badRequest('Request body is required')

  let parsed: CreateAccountInput
  try {
    parsed = JSON.parse(body) as CreateAccountInput
  } catch {
    return r.badRequest('Invalid JSON')
  }

  if (!parsed.accountName?.trim()) return r.badRequest('accountName is required')
  if (!parsed.institutionName?.trim()) return r.badRequest('institutionName is required')
  if (!['checking', 'savings', 'money_market', 'other'].includes(parsed.accountType)) {
    return r.badRequest('accountType must be checking, savings, money_market, or other')
  }
  if (typeof parsed.balance !== 'number') return r.badRequest('balance is required')

  const account = await repo.createAccount(hoaId, parsed)
  return r.created(account)
}
