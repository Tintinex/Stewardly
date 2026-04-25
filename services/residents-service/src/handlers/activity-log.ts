import type { LambdaEvent } from '../../../shared/types'
import * as r from '../../../shared/response'
import { getActivityLog } from '../repository'

/** GET /api/hoa/activity[?limit=50&offset=0] — recent activity feed for board members */
export async function handleActivityLog(event: LambdaEvent, hoaId: string, role: string): Promise<r.ApiResponse> {
  if (role !== 'board_admin' && role !== 'board_member') return r.forbidden()
  const limit = Math.min(parseInt(event.queryStringParameters?.limit ?? '50', 10), 100)
  const offset = parseInt(event.queryStringParameters?.offset ?? '0', 10)
  const entries = await getActivityLog(hoaId, limit, offset)
  return r.ok(entries)
}
