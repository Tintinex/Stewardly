import type { LambdaEvent } from '../../shared/types'
import * as r from '../../shared/response'
import { handleListHoas, handleGetHoa, handleUpdateHoa } from './handlers/hoas'
import { handleListUsers, handleDisableUser, handleEnableUser, handleResetPassword, handleUpdateUserRole } from './handlers/users'
import { handlePlatformStats } from './handlers/stats'
import { handleMonitoring } from './handlers/monitoring'
import { handleBilling } from './handlers/billing'

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

  return r.badRequest(`Unsupported admin route: ${method} ${path}`)
}
