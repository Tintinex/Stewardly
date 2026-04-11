import type { LambdaEvent } from '../../shared/types'
import * as r from '../../shared/response'
import { handleList } from './handlers/list'
import { handleGet } from './handlers/get'
import { handleCreate } from './handlers/create'

export async function route(event: LambdaEvent): Promise<r.ApiResponse> {
  const { hoaId, userId, role } = event.requestContext.authorizer.lambda
  if (!hoaId) return r.unauthorized()

  const method = event.requestContext.http.method
  const meetingId = event.pathParameters?.meetingId

  if (method === 'GET' && !meetingId)  return handleList(hoaId)
  if (method === 'GET' && meetingId)   return handleGet(hoaId, meetingId)
  if (method === 'POST')               return handleCreate(event.body ?? null, hoaId, userId, role)

  return r.badRequest(`Unsupported route: ${method} ${event.requestContext.http.path}`)
}
