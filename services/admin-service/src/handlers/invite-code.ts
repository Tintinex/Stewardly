import * as r from '../../../shared/response'
import { getInviteCode, rotateInviteCode } from '../repository'

/** GET /api/admin/hoas/:hoaId/invite-code — get current active invite code */
export async function handleGetInviteCode(hoaId: string): Promise<r.ApiResponse> {
  const code = await getInviteCode(hoaId)
  if (!code) return r.notFound('Invite code')
  return r.ok(code)
}

/** POST /api/admin/hoas/:hoaId/invite-code — rotate/create new invite code */
export async function handleRotateInviteCode(hoaId: string, adminUserId: string): Promise<r.ApiResponse> {
  const code = await rotateInviteCode(hoaId, adminUserId)
  return r.ok(code)
}
