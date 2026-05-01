import type { LambdaEvent } from '../../../shared/types'
import * as r from '../../../shared/response'
import * as repo from '../repository'

/** GET /api/finances/transactions */
export async function handleListTransactions(event: LambdaEvent, hoaId: string): Promise<r.ApiResponse> {
  const q = event.queryStringParameters ?? {}

  const limit = q.limit ? parseInt(q.limit, 10) : 50
  const offset = q.offset ? parseInt(q.offset, 10) : 0

  const result = await repo.listTransactions(hoaId, {
    startDate: q.startDate,
    endDate: q.endDate,
    category: q.category,
    type: q.type as 'debit' | 'credit' | undefined,
    search: q.search,
    accountId: q.accountId,
    limit: Math.min(limit, 200),
    offset,
  })

  const categories = await repo.getTransactionCategories(hoaId)

  return r.ok({ ...result, categories })
}
