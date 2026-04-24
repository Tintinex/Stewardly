import * as r from '../../../shared/response'
import { getActivityData } from '../repository'
import type { LambdaEvent } from '../../../shared/types'

export async function handleActivity(event: LambdaEvent): Promise<r.ApiResponse> {
  const limit  = Math.min(parseInt(event.queryStringParameters?.limit  ?? '50', 10), 200)
  const offset = parseInt(event.queryStringParameters?.offset ?? '0', 10)
  const data = await getActivityData(limit, offset)
  return r.ok(data)
}
