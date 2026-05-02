import { randomUUID } from 'crypto'
import * as r from '../../../shared/response'
import { uploadFromUrl, makeDocumentKey } from '../s3'
import { detectCategory, VALID_CATEGORIES } from '../categorize'
import { createDocumentRecord, getOwnerIdByCognitoSub } from '../repository'
import { invokeDocumentProcessor } from '../processor-invoke'

/**
 * Extract the Google Drive file ID from any Drive share URL.
 * Supports all common formats:
 *   https://drive.google.com/file/d/{fileId}/view
 *   https://drive.google.com/open?id={fileId}
 *   https://docs.google.com/document/d/{fileId}/edit
 *   https://docs.google.com/spreadsheets/d/{fileId}/edit
 *   https://docs.google.com/presentation/d/{fileId}/edit
 */
function extractDriveFileId(url: string): string | null {
  const patterns = [
    /\/file\/d\/([a-zA-Z0-9_-]{10,})/,
    /[?&]id=([a-zA-Z0-9_-]{10,})/,
    /\/document\/d\/([a-zA-Z0-9_-]{10,})/,
    /\/spreadsheets\/d\/([a-zA-Z0-9_-]{10,})/,
    /\/presentation\/d\/([a-zA-Z0-9_-]{10,})/,
    /\/drawings\/d\/([a-zA-Z0-9_-]{10,})/,
  ]
  for (const p of patterns) {
    const m = url.match(p)
    if (m) return m[1]
  }
  return null
}

/** Detect content type from the Google Drive download response headers. */
function sniffContentType(headers: Headers, fallback = 'application/octet-stream'): string {
  const ct = headers.get('content-type') ?? fallback
  return ct.split(';')[0].trim()
}

/** Derive a reasonable filename from the Content-Disposition header or URL. */
function sniffFileName(headers: Headers, fileId: string): string {
  const cd = headers.get('content-disposition') ?? ''
  const m = cd.match(/filename[^=]*=\s*(?:UTF-8''|"?)([^";]+)/i)
  if (m) return decodeURIComponent(m[1].replace(/"/g, ''))
  return `drive-${fileId.slice(0, 8)}.pdf`
}

/**
 * POST /api/documents/from-drive
 *
 * Imports a Google Drive file into the HOA document library.
 * Requirements:
 *   - The file must be shared as "Anyone with the link can view"
 *   - Max file size: 50 MB
 *
 * Body: { driveUrl, title, category?, description? }
 * Response: DocumentRecord
 */
export async function handleDocumentFromDrive(
  body: string | null,
  hoaId: string,
  userId: string,
  role: string,
): Promise<r.ApiResponse> {
  if (role !== 'board_admin' && role !== 'board_member') {
    return r.forbidden('Only board members can import documents')
  }
  if (!body) return r.badRequest('Request body required')

  let input: { driveUrl: string; title: string; category?: string; description?: string }
  try { input = JSON.parse(body) } catch { return r.badRequest('Invalid JSON') }

  if (!input.driveUrl?.trim()) return r.badRequest('driveUrl is required')
  if (!input.title?.trim())    return r.badRequest('title is required')

  const fileId = extractDriveFileId(input.driveUrl.trim())
  if (!fileId) {
    return r.badRequest('Could not extract file ID from the Google Drive URL. Make sure you\'re using a valid Drive share link.')
  }

  // Google Drive direct download URL
  // ?confirm=t bypasses the virus-scan interstitial for large files
  const downloadUrl = `https://drive.google.com/uc?export=download&id=${fileId}&confirm=t`

  // Probe headers first to check availability + get filename/type
  let probeRes: Response
  try {
    probeRes = await fetch(downloadUrl, { method: 'HEAD', redirect: 'follow' })
  } catch {
    return r.badRequest('Could not reach the Google Drive file. Make sure it is shared as "Anyone with the link."')
  }

  if (probeRes.status === 403 || probeRes.status === 401) {
    return r.badRequest('Access denied. Make sure the file is shared as "Anyone with the link can view."')
  }
  if (!probeRes.ok && probeRes.status !== 405) {
    // 405 = HEAD not allowed, that's fine — fall through to actual download
    return r.badRequest(`Google Drive returned ${probeRes.status}. The file may be private or deleted.`)
  }

  const contentType = sniffContentType(probeRes.headers)
  const fileName    = sniffFileName(probeRes.headers, fileId)
  const autoCategory = detectCategory(fileName, input.title)

  const docId  = randomUUID()
  const s3Key  = makeDocumentKey(hoaId, docId, fileName)
  const category = input.category && VALID_CATEGORIES.includes(input.category as never)
    ? input.category
    : autoCategory

  let sizeBytes: number
  try {
    const result = await uploadFromUrl(downloadUrl, s3Key, contentType)
    sizeBytes = result.sizeBytes
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return r.serverError(`Failed to download from Google Drive: ${msg}`)
  }

  // Resolve the uploader's internal owners.id UUID (uploaded_by FK references owners.id)
  const ownerId = await getOwnerIdByCognitoSub(hoaId, userId)

  const doc = await createDocumentRecord({
    id: docId,
    hoaId,
    title: input.title.trim(),
    description: input.description?.trim() ?? null,
    category,
    autoCategory,
    s3Key,
    fileUrl: `https://drive.google.com/file/d/${fileId}/view`,
    fileName,
    fileSizeBytes: sizeBytes,
    fileType: contentType,
    uploadedBy: ownerId,
    source: 'google_drive',
    originalUrl: input.driveUrl.trim(),
  })

  if (!doc) return r.serverError('Failed to save document record')

  // Trigger AI processing asynchronously
  invokeDocumentProcessor({
    docId: doc.id,
    s3Key,
    hoaId,
    fileType: contentType,
    fileName,
    title: input.title.trim(),
    category: doc.category,
  }).catch(err => console.error('[document-from-drive] Failed to invoke processor:', err))

  return r.created(doc)
}
