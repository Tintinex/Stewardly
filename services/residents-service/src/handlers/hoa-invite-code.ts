import * as r from '../../../shared/response'
import { getHoaInviteCode, rotateHoaInviteCode, logActivity } from '../repository'

/** GET /api/hoa/invite-code — get the HOA's current active invite code */
export async function handleGetHoaInviteCode(hoaId: string, role: string): Promise<r.ApiResponse> {
  if (role !== 'board_admin' && role !== 'board_member') return r.forbidden()
  const code = await getHoaInviteCode(hoaId)
  return r.ok(code ?? null)
}

/** POST /api/hoa/invite-code — create or regenerate invite code (board_admin only) */
export async function handleRotateHoaInviteCode(
  body: string | null,
  hoaId: string,
  userId: string,
  role: string,
): Promise<r.ApiResponse> {
  if (role !== 'board_admin') return r.forbidden('Only board admins can manage invite codes')

  const input = body ? (JSON.parse(body) as { maxUses?: number; expiresInDays?: number }) : {}
  const expiresAt = input.expiresInDays
    ? new Date(Date.now() + input.expiresInDays * 86400000).toISOString()
    : null

  const code = await rotateHoaInviteCode({ hoaId, createdBy: userId, maxUses: input.maxUses ?? null, expiresAt })
  await logActivity(hoaId, userId, 'invite_code_rotated', { newCode: code.code })
  return r.created(code)
}
