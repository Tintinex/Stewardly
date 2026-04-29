import type { LambdaEvent } from '../../shared/types'
import * as r from '../../shared/response'
import { handleListHoas, handleGetHoa, handleUpdateHoa } from './handlers/hoas'
import { handleListUsers, handleDisableUser, handleEnableUser, handleResetPassword, handleUpdateUserRole, handleRemoveUser } from './handlers/users'
import { handleGetHoaHealth } from './handlers/health'
import { handlePlatformStats } from './handlers/stats'
import { handleMonitoring } from './handlers/monitoring'
import { handleBilling } from './handlers/billing'
import { handleAdminDashboard } from './handlers/dashboard'
import { handleGetSubscriptions, handleUpdateSubscription, handleExtendTrial } from './handlers/subscriptions'
import { handleActivity } from './handlers/activity'
import { handleGetInviteCode, handleRotateInviteCode } from './handlers/invite-code'
import { handleCreateHoaAdmin } from './handlers/create-hoa-admin'

export async function route(event: LambdaEvent): Promise<r.ApiResponse> {
  const { role, userId } = event.requestContext.authorizer.lambda

  // Enforce superadmin-only at the router level (defense-in-depth)
  if (role !== 'superadmin') {
    return r.forbidden('Admin access required')
  }

  const method = event.requestContext.http.method
  const path = event.requestContext.http.path

  // GET /api/admin/hoas
  if (method === 'GET' && path === '/api/admin/hoas') return handleListHoas()

  // GET /api/admin/hoas/:hoaId/health
  const healthMatch = path.match(/^\/api\/admin\/hoas\/([^/]+)\/health$/)
  if (healthMatch && method === 'GET') return handleGetHoaHealth(healthMatch[1])

  // GET/POST /api/admin/hoas/:hoaId/invite-code
  const inviteCodeMatch = path.match(/^\/api\/admin\/hoas\/([^/]+)\/invite-code$/)
  if (inviteCodeMatch) {
    if (method === 'GET')  return handleGetInviteCode(inviteCodeMatch[1])
    if (method === 'POST') return handleRotateInviteCode(inviteCodeMatch[1], userId)
  }

  // POST /api/admin/hoas/:hoaId/admin-user — create board_admin Cognito user
  const adminUserMatch = path.match(/^\/api\/admin\/hoas\/([^/]+)\/admin-user$/)
  if (adminUserMatch && method === 'POST') return handleCreateHoaAdmin(adminUserMatch[1], event.body ?? null, userId)

  // DELETE /api/admin/hoas/:hoaId/users/:ownerId — remove member from HOA
  const removeUserMatch = path.match(/^\/api\/admin\/hoas\/([^/]+)\/users\/([^/]+)$/)
  if (removeUserMatch && method === 'DELETE') return handleRemoveUser(removeUserMatch[1], removeUserMatch[2], userId)

  // GET /api/admin/hoas/:hoaId
  const hoaMatch = path.match(/^\/api\/admin\/hoas\/([^/]+)$/)
  if (hoaMatch) {
    if (method === 'GET')   return handleGetHoa(hoaMatch[1])
    if (method === 'PATCH') return handleUpdateHoa(hoaMatch[1], event.body ?? null, userId)
  }

  // GET /api/admin/users  (optional ?hoaId=xxx)
  if (method === 'GET' && path === '/api/admin/users') {
    const hoaId = event.queryStringParameters?.hoaId
    return handleListUsers(hoaId)
  }

  // POST /api/admin/users/:userId/disable
  const disableMatch = path.match(/^\/api\/admin\/users\/([^/]+)\/disable$/)
  if (disableMatch && method === 'POST') return handleDisableUser(disableMatch[1], userId)

  // POST /api/admin/users/:userId/enable
  const enableMatch = path.match(/^\/api\/admin\/users\/([^/]+)\/enable$/)
  if (enableMatch && method === 'POST') return handleEnableUser(enableMatch[1], userId)

  // POST /api/admin/users/:userId/reset-password
  const resetMatch = path.match(/^\/api\/admin\/users\/([^/]+)\/reset-password$/)
  if (resetMatch && method === 'POST') return handleResetPassword(resetMatch[1], userId)

  // PATCH /api/admin/users/:userId/role
  const roleMatch = path.match(/^\/api\/admin\/users\/([^/]+)$/)
  if (roleMatch && method === 'PATCH') return handleUpdateUserRole(roleMatch[1], event.body ?? null, userId)

  // GET /api/admin/stats
  if (method === 'GET' && path === '/api/admin/stats') return handlePlatformStats()

  // GET /api/admin/monitoring
  if (method === 'GET' && path === '/api/admin/monitoring') return handleMonitoring()

  // GET /api/admin/billing
  if (method === 'GET' && path === '/api/admin/billing') return handleBilling()

  // GET /api/admin/dashboard
  if (method === 'GET' && path === '/api/admin/dashboard') return handleAdminDashboard()

  // GET /api/admin/subscriptions
  if (method === 'GET' && path === '/api/admin/subscriptions') return handleGetSubscriptions()

  // PATCH /api/admin/subscriptions/:hoaId — change tier
  const subMatch = path.match(/^\/api\/admin\/subscriptions\/([^/]+)$/)
  if (subMatch && method === 'PATCH') return handleUpdateSubscription(subMatch[1], event.body ?? null, userId)

  // POST /api/admin/subscriptions/:hoaId/extend-trial
  const extendMatch = path.match(/^\/api\/admin\/subscriptions\/([^/]+)\/extend-trial$/)
  if (extendMatch && method === 'POST') return handleExtendTrial(extendMatch[1], event.body ?? null, userId)

  // GET /api/admin/activity
  if (method === 'GET' && path === '/api/admin/activity') return handleActivity(event)

  return r.badRequest(`Unsupported admin route: ${method} ${path}`)
}
