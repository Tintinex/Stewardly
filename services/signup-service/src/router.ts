import type { LambdaEvent } from '../../shared/types'
import * as r from '../../shared/response'
import { handleValidateInvite } from './handlers/validate-invite'

export async function route(event: LambdaEvent): Promise<r.ApiResponse> {
  const method = event.requestContext.http.method
  const path = event.requestContext.http.path

  if (method === 'GET' && path.endsWith('/validate-invite')) return handleValidateInvite(event)

  return r.badRequest('Not found')
}
