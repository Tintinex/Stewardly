import type { LambdaEvent } from '../../../shared/types'
import * as r from '../../../shared/response'
import { listMembers } from '../repository'

/** GET /api/hoa/members[?status=pending|active|suspended] — member list for HOA admin */
export async function handleListMembers(event: LambdaEvent, hoaId: string, role: string): Promise<r.ApiResponse> {
  if (role !== 'board_admin' && role !== 'board_member') return r.forbidden()
  const status = event.queryStringParameters?.status as 'pending' | 'active' | 'suspended' | undefined
  const members = await listMembers(hoaId, status)
  return r.ok(members)
}
