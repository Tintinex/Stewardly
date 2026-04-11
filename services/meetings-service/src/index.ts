import type { LambdaEvent } from '../../shared/types'
import * as r from '../../shared/response'
import { route } from './router'

export const handler = async (event: LambdaEvent): Promise<r.ApiResponse> => {
  try {
    return await route(event)
  } catch (err) {
    console.error('[meetings-service] Unhandled error:', err)
    return r.serverError()
  }
}
