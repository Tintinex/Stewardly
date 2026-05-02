import type { LambdaEvent } from '../../shared/types'
import * as r from '../../shared/response'
import { handleList } from './handlers/list'
import { handleCreate } from './handlers/create'
import { handleUpdate } from './handlers/update'
import { handleEnsureOwner } from './handlers/ensure-owner'
import { handleGetMyProfile } from './handlers/get-my-profile'
import { handleUpdateMyProfile } from './handlers/update-my-profile'
import { handleMyUnit } from './handlers/my-unit'
import { handleListMaintenance } from './handlers/list-maintenance'
import { handleCreateMaintenance } from './handlers/create-maintenance'
import { handleListDocuments } from './handlers/list-documents'
import { handleCreateDocument } from './handlers/create-document'
import { handleDocumentPresignedUrl } from './handlers/document-presigned-url'
import { handleDocumentFromDrive } from './handlers/document-from-drive'
import { handleDocumentDownload } from './handlers/document-download'
import { handleDeleteDocument } from './handlers/delete-document'
import { handleAskDocuments } from './handlers/ask-documents'
import { handleHoaStats } from './handlers/hoa-stats'
import { handleListMembers } from './handlers/list-members'
import { handleUpdateMemberStatus } from './handlers/update-member-status'
import { handleGetHoaInviteCode, handleRotateHoaInviteCode } from './handlers/hoa-invite-code'
import { handleActivityLog } from './handlers/activity-log'
import {
  handleListUnits,
  handleCreateUnit,
  handleUpdateUnit,
  handleDeleteUnit,
  handleImportUnits,
  handleListDocumentsForScan,
  handleScanDocument,
} from './handlers/units'
import {
  handleListPackages,
  handlePendingPackageCount,
  handleCreatePackage,
  handleUpdatePackage,
  handleDeletePackage,
} from './handlers/packages'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function route(event: LambdaEvent): Promise<r.ApiResponse> {
  const { hoaId, userId, role } = event.requestContext.authorizer.lambda

  const method = event.requestContext.http.method
  const path = event.requestContext.http.path
  const residentId = event.pathParameters?.residentId

  // Routes that don't need a valid hoaId (they read it from the JWT themselves or are public)
  // must be listed BEFORE the UUID guard below.

  // GET /api/residents/me — return current user's profile (name, hoaName, avatarUrl, etc.)
  // Supports ?avatarUpload=true to get a presigned PUT URL for photo upload
  if (method === 'GET' && path.endsWith('/residents/me')) return handleGetMyProfile(event)

  // PATCH /api/residents/me — update profile (firstName, lastName, phone, avatarKey)
  if (method === 'PATCH' && path.endsWith('/residents/me')) return handleUpdateMyProfile(event)

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

  // POST /api/documents/ask — Q&A for all authenticated members
  if (method === 'POST' && path.endsWith('/documents/ask')) {
    if (!hoaId) return r.unauthorized()
    return handleAskDocuments(event.body ?? null, hoaId)
  }

  // POST /api/documents/presigned-url — must come before /documents catch-all
  if (method === 'POST' && path.endsWith('/documents/presigned-url')) {
    if (!hoaId) return r.unauthorized()
    return handleDocumentPresignedUrl(event.body ?? null, hoaId, role)
  }

  // POST /api/documents/from-drive
  if (method === 'POST' && path.endsWith('/documents/from-drive')) {
    if (!hoaId) return r.unauthorized()
    return handleDocumentFromDrive(event.body ?? null, hoaId, userId, role)
  }

  // GET /api/documents/:id/download
  const docDownloadMatch = path.match(/\/documents\/([^/]+)\/download$/)
  if (docDownloadMatch && method === 'GET') {
    if (!hoaId) return r.unauthorized()
    return handleDocumentDownload(docDownloadMatch[1], hoaId)
  }

  // DELETE /api/documents/:id
  const docDeleteMatch = path.match(/\/documents\/([^/]+)$/)
  if (docDeleteMatch && method === 'DELETE') {
    if (!hoaId) return r.unauthorized()
    return handleDeleteDocument(docDeleteMatch[1], hoaId, userId, role)
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

  // ── HOA Admin routes ────────────────────────────────────────────────────────

  // GET /api/hoa/stats
  if (method === 'GET' && path.endsWith('/hoa/stats')) {
    if (!hoaId) return r.unauthorized()
    return handleHoaStats(hoaId)
  }

  // GET /api/hoa/members[?status=...]
  if (method === 'GET' && path.endsWith('/hoa/members')) {
    if (!hoaId) return r.unauthorized()
    return handleListMembers(event, hoaId, role)
  }

  // PATCH /api/hoa/members/:memberId/status
  const memberStatusMatch = path.match(/\/hoa\/members\/([^/]+)\/status$/)
  if (memberStatusMatch && method === 'PATCH') {
    if (!hoaId) return r.unauthorized()
    return handleUpdateMemberStatus(event.body ?? null, hoaId, memberStatusMatch[1], userId, role)
  }

  // GET /api/hoa/invite-code
  if (method === 'GET' && path.endsWith('/hoa/invite-code')) {
    if (!hoaId) return r.unauthorized()
    return handleGetHoaInviteCode(hoaId, role)
  }

  // POST /api/hoa/invite-code (create/rotate)
  if (method === 'POST' && path.endsWith('/hoa/invite-code')) {
    if (!hoaId) return r.unauthorized()
    return handleRotateHoaInviteCode(event.body ?? null, hoaId, userId, role)
  }

  // GET /api/hoa/activity[?limit=&offset=]
  if (method === 'GET' && path.endsWith('/hoa/activity')) {
    if (!hoaId) return r.unauthorized()
    return handleActivityLog(event, hoaId, role)
  }

  // ── Units ─────────────────────────────────────────────────────────────────────

  // POST /api/units/import — must come before /units catch-all
  if (method === 'POST' && path.endsWith('/units/import')) {
    if (!hoaId) return r.unauthorized()
    return handleImportUnits(event.body ?? null, hoaId, role)
  }

  // POST /api/units/scan-document
  if (method === 'POST' && path.endsWith('/units/scan-document')) {
    if (!hoaId) return r.unauthorized()
    return handleScanDocument(event.body ?? null, hoaId, role)
  }

  // GET /api/units/documents — list documents for scanning picker
  if (method === 'GET' && path.endsWith('/units/documents')) {
    if (!hoaId) return r.unauthorized()
    return handleListDocumentsForScan(hoaId, role)
  }

  // GET /api/units
  if (method === 'GET' && path.endsWith('/units')) {
    if (!hoaId) return r.unauthorized()
    return handleListUnits(hoaId, role)
  }

  // POST /api/units
  if (method === 'POST' && path.endsWith('/units')) {
    if (!hoaId) return r.unauthorized()
    return handleCreateUnit(event.body ?? null, hoaId, role)
  }

  // PATCH /api/units/:unitId  |  DELETE /api/units/:unitId
  const unitMatch = path.match(/\/units\/([^/]+)$/)
  if (unitMatch && method === 'PATCH') {
    if (!hoaId) return r.unauthorized()
    return handleUpdateUnit(event.body ?? null, hoaId, unitMatch[1], role)
  }
  if (unitMatch && method === 'DELETE') {
    if (!hoaId) return r.unauthorized()
    return handleDeleteUnit(hoaId, unitMatch[1], role)
  }

  // ── Packages ───────────────────────────────────────────────────────────────

  // GET /api/packages/pending-count — must come before /packages catch-all
  if (method === 'GET' && path.endsWith('/packages/pending-count')) {
    if (!hoaId) return r.unauthorized()
    return handlePendingPackageCount(hoaId, userId, role)
  }

  // GET /api/packages
  if (method === 'GET' && path.endsWith('/packages')) {
    if (!hoaId) return r.unauthorized()
    return handleListPackages(event, hoaId, userId, role)
  }

  // POST /api/packages
  if (method === 'POST' && path.endsWith('/packages')) {
    if (!hoaId) return r.unauthorized()
    return handleCreatePackage(event.body ?? null, hoaId, userId, role)
  }

  // PATCH /api/packages/:packageId
  const packageMatch = path.match(/\/packages\/([^/]+)$/)
  if (packageMatch && method === 'PATCH') {
    if (!hoaId) return r.unauthorized()
    return handleUpdatePackage(event.body ?? null, hoaId, packageMatch[1], userId, role)
  }

  // DELETE /api/packages/:packageId
  if (packageMatch && method === 'DELETE') {
    if (!hoaId) return r.unauthorized()
    return handleDeletePackage(hoaId, packageMatch[1], role)
  }

  // Remaining routes require a valid UUID hoaId
  if (!hoaId) return r.unauthorized()
  if (!UUID_RE.test(hoaId)) {
    console.error(`[residents-service] Invalid hoaId in token: ${hoaId}`)
    return r.badRequest('Your account is not linked to a valid community. Please contact support.')
  }

  if (method === 'GET' && !residentId)        return handleList(hoaId, userId, role)
  if (method === 'POST')                       return handleCreate(event.body ?? null, hoaId, userId, role)
  if (method === 'PATCH' && residentId)        return handleUpdate(event.body ?? null, hoaId, residentId, userId, role)

  return r.badRequest(`Unsupported route: ${method} ${path}`)
}
