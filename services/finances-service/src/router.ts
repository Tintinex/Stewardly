import type { LambdaEvent } from '../../shared/types'
import * as r from '../../shared/response'
import { handleGetSummary } from './handlers/get-summary'
import { handleCreateBudget } from './handlers/create-budget'

export async function route(event: LambdaEvent): Promise<r.ApiResponse> {
  const { hoaId, role } = event.requestContext.authorizer.lambda
  if (!hoaId) return r.unauthorized()

  const method = event.requestContext.http.method

  if (method === 'GET')  return handleGetSummary(hoaId)
  if (method === 'POST') return handleCreateBudget(event.body ?? null, hoaId, role)

  return r.badRequest(`Unsupported route: ${method} ${event.requestContext.http.path}`)
}
