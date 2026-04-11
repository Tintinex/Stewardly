import type { LambdaEvent } from '../../shared/types'
import * as r from '../../shared/response'
import { handleList } from './handlers/list'
import { handleCreate } from './handlers/create'
import { handleUpdate } from './handlers/update'
import { handleDelete } from './handlers/delete'

export async function route(event: LambdaEvent): Promise<r.ApiResponse> {
  const { hoaId, userId, role } = event.requestContext.authorizer.lambda
  if (!hoaId) return r.unauthorized()

  const method = event.requestContext.http.method
  const taskId = event.pathParameters?.taskId

  if (method === 'GET' && !taskId) return handleList(hoaId)
  if (method === 'POST')              return handleCreate(event.body ?? null, hoaId, userId)
  if (method === 'PATCH' && taskId)   return handleUpdate(event.body ?? null, hoaId, taskId)
  if (method === 'DELETE' && taskId)  return handleDelete(hoaId, taskId, role)

  return r.badRequest(`Unsupported route: ${method} ${event.requestContext.http.path}`)
}
