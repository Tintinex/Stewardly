import type { LambdaEvent } from '../../shared/types'
import * as r from '../../shared/response'
import { handleList } from './handlers/list'
import { handleCreate } from './handlers/create'
import { handleUpdate } from './handlers/update'

export async function route(event: LambdaEvent): Promise<r.ApiResponse> {
  const { hoaId, userId, role } = event.requestContext.authorizer.lambda
  if (!hoaId) return r.unauthorized()

  const method = event.requestContext.http.method
  const residentId = event.pathParameters?.residentId

  if (method === 'GET' && !residentId)        return handleList(hoaId, userId, role)
  if (method === 'POST')                       return handleCreate(event.body ?? null, hoaId, userId, role)
  if (method === 'PATCH' && residentId)        return handleUpdate(event.body ?? null, hoaId, residentId, userId, role)

  return r.badRequest(`Unsupported route: ${method} ${event.requestContext.http.path}`)
}
