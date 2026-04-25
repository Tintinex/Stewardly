import * as r from '../../../shared/response'
import { updateMemberStatus, logMembershipEvent, logActivity } from '../repository'

const EVENT_TYPE_MAP: Record<string, 'approved' | 'rejected' | 'suspended' | 'reinstated'> = {
  active: 'approved',
  suspended: 'suspended',
}

/**
 * PATCH /api/hoa/members/:memberId/status
 * Body: { status: 'active' | 'suspended', notes?: string }
 */
export async function handleUpdateMemberStatus(
  body: string | null,
  hoaId: string,
  memberId: string,
  actorId: string,
  actorRole: string,
): Promise<r.ApiResponse> {
  if (actorRole !== 'board_admin') return r.forbidden('Only board admins can update member status')
  if (!body) return r.badRequest('Request body required')

  const input = JSON.parse(body) as { status?: string; notes?: string }
  const { status, notes } = input

  if (!status || !['active', 'suspended'].includes(status)) {
    return r.badRequest('status must be "active" or "suspended"')
  }

  const member = await updateMemberStatus(hoaId, memberId, status as 'active' | 'suspended')
  if (!member) return r.notFound('Member')

  const eventType = EVENT_TYPE_MAP[status] ?? 'approved'
  await logMembershipEvent({
    hoaId,
    ownerId: memberId,
    eventType,
    performedBy: actorId,
    notes: notes ?? null,
  })

  const activityAction = status === 'active' ? 'member_approved' : 'member_suspended'
  await logActivity(hoaId, actorId, activityAction, { memberId, memberName: `${member.firstName} ${member.lastName}` })

  return r.ok(member)
}
