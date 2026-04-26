import type { LambdaEvent } from '../../shared/types'
import * as r from '../../shared/response'
import { handleValidateInvite } from './handlers/validate-invite'
import { handleRegisterHoa } from './handlers/register-hoa'

export async function route(event: LambdaEvent): Promise<r.ApiResponse> {
  const method = event.requestContext.http.method
  const path = event.requestContext.http.path

  if (method === 'GET'  && path.endsWith('/validate-invite')) return handleValidateInvite(event)
  if (method === 'POST' && path.endsWith('/register-hoa'))    return handleRegisterHoa(event.body ?? null)

  return r.badRequest('Not found')
}
