import * as r from '../../../shared/response'
import {
  listPackages,
  getPackageById,
  createPackage,
  updatePackage,
  deletePackage,
  getPendingPackageCount,
  getOwnerIdByCognitoSub,
  getUnitByNumber,
  listUnitsForHoa,
} from '../repository'
import { parsePackageLabel } from '../../../document-processor/src/claude'

export type PackageCarrier = 'USPS' | 'FedEx' | 'UPS' | 'Amazon' | 'DHL' | 'OnTrac' | 'Other'
export const CARRIERS: PackageCarrier[] = ['USPS', 'FedEx', 'UPS', 'Amazon', 'DHL', 'OnTrac', 'Other']

// ── GET /api/packages ─────────────────────────────────────────────────────────
// Board: all packages for the HOA (filterable by status/unitId)
// Resident: only packages for their unit

export async function handleListPackages(
  event: { queryStringParameters?: Record<string, string> | null },
  hoaId: string,
  userId: string,
  role: string,
): Promise<r.ApiResponse> {
  const isBoard = role === 'board_admin' || role === 'board_member'
  const status  = event.queryStringParameters?.status ?? null
  const unitId  = event.queryStringParameters?.unitId ?? null

  if (isBoard) {
    const packages = await listPackages({ hoaId, status, unitId })
    return r.ok(packages)
  }

  // Residents: look up their unit_id from their owner record
  const ownerId = await getOwnerIdByCognitoSub(hoaId, userId)
  if (!ownerId) return r.unauthorized()
  const packages = await listPackages({ hoaId, status, ownerId })
  return r.ok(packages)
}

// ── GET /api/packages/pending-count ──────────────────────────────────────────
// Returns { count } — used for sidebar badge

export async function handlePendingPackageCount(
  hoaId: string,
  userId: string,
  role: string,
): Promise<r.ApiResponse> {
  const isBoard = role === 'board_admin' || role === 'board_member'
  if (isBoard) {
    const count = await getPendingPackageCount({ hoaId })
    return r.ok({ count })
  }
  const ownerId = await getOwnerIdByCognitoSub(hoaId, userId)
  if (!ownerId) return r.ok({ count: 0 })
  const count = await getPendingPackageCount({ hoaId, ownerId })
  return r.ok({ count })
}

// ── POST /api/packages ────────────────────────────────────────────────────────
// Board only — log a newly received package

export async function handleCreatePackage(
  body: string | null,
  hoaId: string,
  userId: string,
  role: string,
): Promise<r.ApiResponse> {
  if (role !== 'board_admin' && role !== 'board_member') {
    return r.forbidden('Only board members can log packages')
  }
  if (!body) return r.badRequest('Request body required')

  let input: {
    unitId?: string
    unitNumber?: string
    carrier?: string
    trackingNumber?: string
    description?: string
    notes?: string
    recipientName?: string
  }
  try { input = JSON.parse(body) } catch { return r.badRequest('Invalid JSON') }

  // Accept either unitId or unitNumber
  let resolvedUnitId = input.unitId?.trim() ?? null
  if (!resolvedUnitId && input.unitNumber?.trim()) {
    const unit = await getUnitByNumber(hoaId, input.unitNumber.trim())
    if (!unit) return r.notFound('Unit')
    resolvedUnitId = unit.id
  }
  if (!resolvedUnitId) return r.badRequest('unitId or unitNumber is required')

  const carrier = CARRIERS.includes(input.carrier as PackageCarrier)
    ? (input.carrier as PackageCarrier)
    : 'Other'

  const loggedBy = await getOwnerIdByCognitoSub(hoaId, userId)

  const pkg = await createPackage({
    hoaId,
    unitId: resolvedUnitId,
    carrier,
    trackingNumber: input.trackingNumber?.trim() ?? null,
    description:    input.description?.trim() ?? null,
    notes:          input.notes?.trim() ?? null,
    recipientName:  input.recipientName?.trim() ?? null,
    loggedBy,
  })

  return r.created(pkg)
}

// ── PATCH /api/packages/:packageId ───────────────────────────────────────────
// Board: can mark as picked_up or returned, edit notes
// Resident: no patch access

export async function handleUpdatePackage(
  body: string | null,
  hoaId: string,
  packageId: string,
  userId: string,
  role: string,
): Promise<r.ApiResponse> {
  if (role !== 'board_admin' && role !== 'board_member') {
    return r.forbidden('Only board members can update package records')
  }
  if (!body) return r.badRequest('Request body required')

  let input: {
    status?: string
    notes?: string
    trackingNumber?: string
    recipientName?: string
  }
  try { input = JSON.parse(body) } catch { return r.badRequest('Invalid JSON') }

  const pkg = await getPackageById(packageId, hoaId)
  if (!pkg) return r.notFound('Package')

  const allowedStatuses = ['pending', 'picked_up', 'returned']
  if (input.status && !allowedStatuses.includes(input.status)) {
    return r.badRequest(`Invalid status. Must be one of: ${allowedStatuses.join(', ')}`)
  }

  // Record who marked it as picked up
  let pickedUpBy: string | null = null
  if (input.status === 'picked_up' && pkg.status !== 'picked_up') {
    pickedUpBy = await getOwnerIdByCognitoSub(hoaId, userId)
  }

  const updated = await updatePackage(packageId, hoaId, {
    status:         input.status,
    notes:          input.notes,
    trackingNumber: input.trackingNumber,
    recipientName:  input.recipientName,
    pickedUpBy:     pickedUpBy ?? undefined,
  })

  return r.ok(updated)
}

// ── DELETE /api/packages/:packageId ──────────────────────────────────────────
// Board admin only

export async function handleDeletePackage(
  hoaId: string,
  packageId: string,
  role: string,
): Promise<r.ApiResponse> {
  if (role !== 'board_admin') {
    return r.forbidden('Only board admins can delete package records')
  }
  const pkg = await getPackageById(packageId, hoaId)
  if (!pkg) return r.notFound('Package')

  await deletePackage(packageId, hoaId)
  return r.ok({ success: true })
}

// ── POST /api/packages/parse-label ────────────────────────────────────────────
// Board only. Accepts a base64 image and returns extracted label fields.

const ALLOWED_MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const
type AllowedMediaType = (typeof ALLOWED_MEDIA_TYPES)[number]

export async function handleParsePackageLabel(
  body: string | null,
  role: string,
): Promise<r.ApiResponse> {
  if (role !== 'board_admin' && role !== 'board_member') {
    return r.forbidden('Only board members can use label scanning')
  }
  if (!body) return r.badRequest('Request body is required')

  let parsed: { imageBase64?: string; mediaType?: string }
  try {
    parsed = JSON.parse(body) as { imageBase64?: string; mediaType?: string }
  } catch {
    return r.badRequest('Invalid JSON')
  }

  const { imageBase64, mediaType } = parsed
  if (!imageBase64 || typeof imageBase64 !== 'string') {
    return r.badRequest('imageBase64 is required')
  }
  if (!mediaType || !ALLOWED_MEDIA_TYPES.includes(mediaType as AllowedMediaType)) {
    return r.badRequest('mediaType must be one of: image/jpeg, image/png, image/webp, image/gif')
  }

  const result = await parsePackageLabel(imageBase64, mediaType as AllowedMediaType)
  if (!result) {
    return r.ok({ carrier: 'Other' }) // graceful fallback — no fields extracted
  }

  return r.ok(result)
}
