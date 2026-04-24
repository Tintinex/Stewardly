import * as r from '../../../shared/response'
import { validateInviteCode } from '../repository'
import type { LambdaEvent } from '../../../shared/types'

/** GET /api/signup/validate-invite?code=XXXXXX — public endpoint, no hoaId check */
export async function handleValidateInvite(event: LambdaEvent): Promise<r.ApiResponse> {
  const code = event.queryStringParameters?.code
  if (!code) return r.badRequest('code query parameter is required')

  const result = await validateInviteCode(code)
  return r.ok(result)
}
