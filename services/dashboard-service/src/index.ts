import type { LambdaEvent } from '../../shared/types'
import * as r from '../../shared/response'
import { getDashboard } from './repository'

export const handler = async (event: LambdaEvent): Promise<r.ApiResponse> => {
  const { hoaId } = event.requestContext.authorizer.lambda
  if (!hoaId) return r.unauthorized()

  try {
    const data = await getDashboard(hoaId)
    return r.ok(data)
  } catch (err) {
    console.error('[dashboard-service] Unhandled error:', err)
    return r.serverError()
  }
}
