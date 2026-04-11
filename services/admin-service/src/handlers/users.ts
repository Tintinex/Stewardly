import * as r from '../../../shared/response'
import { listUsers, writeAuditLog } from '../repository'
import {
  listCognitoUsers,
  adminDisableUser,
  adminEnableUser,
  adminResetUserPassword,
  adminUpdateUserRole,
} from '../cognito'

export async function handleListUsers(hoaId?: string): Promise<r.ApiResponse> {
  const [dbUsers, cognitoUsers] = await Promise.all([
    listUsers(hoaId),
    listCognitoUsers(hoaId),
  ])

  // Merge DB records with Cognito status
  const cognitoMap = new Map(cognitoUsers.map(u => [u.email, u]))
  const merged = dbUsers.map(u => ({
    ...u,
    status: cognitoMap.get(u.email)?.status ?? 'active',
    cognitoUsername: cognitoMap.get(u.email)?.username ?? null,
  }))

  return r.ok(merged)
}

export async function handleDisableUser(userId: string, adminUserId: string): Promise<r.ApiResponse> {
  // userId here is the Cognito username (sub or username)
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

  await adminUpdateUserRole(userId, input.role)
  await writeAuditLog(adminUserId, 'UPDATE_ROLE', 'user', userId, { role: input.role })
  return r.ok({ success: true })
}
