import type { LambdaEvent } from '../../shared/types'
import * as r from '../../shared/response'
import { handleList } from './handlers/list'
import { handleCreate } from './handlers/create'
import { handleUpdate } from './handlers/update'
import { handleEnsureOwner } from './handlers/ensure-owner'
import { handleMyUnit } from './handlers/my-unit'
import { handleListMaintenance } from './handlers/list-maintenance'
import { handleCreateMaintenance } from './handlers/create-maintenance'
import { handleListDocuments } from './handlers/list-documents'
import { handleCreateDocument } from './handlers/create-document'

export async function route(event: LambdaEvent): Promise<r.ApiResponse> {
  const { hoaId, userId, role } = event.requestContext.authorizer.lambda

  const method = event.requestContext.http.method
  const path = event.requestContext.http.path
  const residentId = event.pathParameters?.residentId

  // POST /api/residents/me — upsert owner from JWT claims (hoaId may be set from JWT for homeowners)
  if (method === 'POST' && path.endsWith('/residents/me')) return handleEnsureOwner(event)

  // GET /api/my-unit — current user's unit + assessments
  if (method === 'GET' && path.endsWith('/my-unit')) {
    if (!hoaId) return r.unauthorized()
    return handleMyUnit(hoaId, userId)
  }

  // GET /api/maintenance-requests
  if (method === 'GET' && path.endsWith('/maintenance-requests')) {
    if (!hoaId) return r.unauthorized()
    return handleListMaintenance(hoaId, userId, role)
  }

  // POST /api/maintenance-requests
  if (method === 'POST' && path.endsWith('/maintenance-requests')) {
    if (!hoaId) return r.unauthorized()
    return handleCreateMaintenance(event.body ?? null, hoaId, userId)
  }

  // GET /api/documents
  if (method === 'GET' && path.endsWith('/documents')) {
    if (!hoaId) return r.unauthorized()
    return handleListDocuments(event, hoaId)
  }

  // POST /api/documents
  if (method === 'POST' && path.endsWith('/documents')) {
    if (!hoaId) return r.unauthorized()
    return handleCreateDocument(event.body ?? null, hoaId, userId, role)
  }

  // Remaining routes require hoaId
  if (!hoaId) return r.unauthorized()

  if (method === 'GET' && !residentId)        return handleList(hoaId, userId, role)
  if (method === 'POST')                       return handleCreate(event.body ?? null, hoaId, userId, role)
  if (method === 'PATCH' && residentId)        return handleUpdate(event.body ?? null, hoaId, residentId, userId, role)

  return r.badRequest(`Unsupported route: ${method} ${path}`)
}
