import * as r from '../../../shared/response'
import { listUsers, writeAuditLog, removeUserFromHoa, getOwnerCognitoSub, updateOwnerRoleByCognitoSub } from '../repository'
import {
  listCognitoUsers,
  adminDisableUser,
  adminEnableUser,
  adminResetUserPassword,
  adminUpdateUserRole,
  clearUserHoaAttribute,
} from '../cognito'

export async function handleListUsers(hoaId?: string): Promise<r.ApiResponse> {
  if (hoaId) {
    // Cognito ListUsers can't filter by custom attributes — use DB only for HOA-scoped view
    const dbUsers = await listUsers(hoaId)
    return r.ok(dbUsers.map(u => ({
      ...u,
      status: (u.dbStatus === 'active' ? 'active' : 'disabled') as 'active' | 'disabled',
      cognitoUsername: u.cognitoSub ?? null,
    })))
  }

  // All-users view: merge DB + Cognito for enabled/disabled status
  const [dbUsers, cognitoUsers] = await Promise.all([
    listUsers(),
    listCognitoUsers(),
  ])
  const cognitoMap = new Map(cognitoUsers.map(u => [u.email, u]))
  const merged = dbUsers.map(u => ({
    ...u,
    status: (cognitoMap.get(u.email)?.status ?? 'active') as 'active' | 'disabled',
    cognitoUsername: cognitoMap.get(u.email)?.username ?? u.cognitoSub ?? null,
  }))
  return r.ok(merged)
}

export async function handleDisableUser(userId: string, adminUserId: string): Promise<r.ApiResponse> {
  await adminDisableUser(userId)
  await writeAuditLog(adminUserId, 'DISABLE_USER', 'user', userId, {})
  return r.ok({ success: true })
}

export async function handleEnableUser(userId: string, adminUserId: string): Promise<r.ApiResponse> {
  await adminEnableUser(userId)
  await writeAuditLog(adminUserId, 'ENABLE_USER', 'user', userId, {})
  return r.ok({ success: true })
}

export async function handleResetPassword(userId: string, adminUserId: string): Promise<r.ApiResponse> {
  await adminResetUserPassword(userId)
  await writeAuditLog(adminUserId, 'RESET_PASSWORD', 'user', userId, {})
  return r.ok({ success: true })
}

export async function handleUpdateUserRole(
  userId: string,
  body: string | null,
  adminUserId: string,
): Promise<r.ApiResponse> {
  if (!body) return r.badRequest('Request body required')

  let input: { role: string }
  try {
    input = JSON.parse(body) as { role: string }
  } catch {
    return r.badRequest('Invalid JSON')
  }
  if (!input.role) return r.badRequest('role is required')

  // Update both Cognito attribute and DB owners record
  await Promise.all([
    adminUpdateUserRole(userId, input.role),
    updateOwnerRoleByCognitoSub(userId, input.role),
  ])
  await writeAuditLog(adminUserId, 'UPDATE_ROLE', 'user', userId, { role: input.role })
  return r.ok({ success: true })
}

export async function handleRemoveUser(
  hoaId: string,
  ownerId: string,
  adminUserId: string,
): Promise<r.ApiResponse> {
  // Look up cognito sub before soft-deleting the owner record
  const cognitoSub = await getOwnerCognitoSub(ownerId, hoaId)

  // Soft-delete owner (status → inactive) to preserve task/meeting FK history
  await removeUserFromHoa(hoaId, ownerId)

  // Revoke Cognito access so they can't log back in and recreate the row
  if (cognitoSub) {
    await adminDisableUser(cognitoSub)
    await clearUserHoaAttribute(cognitoSub)
  }

  await writeAuditLog(adminUserId, 'REMOVE_USER', 'user', ownerId, { hoaId })
  return r.ok({ success: true })
}
