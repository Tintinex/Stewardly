import * as r from '../../../shared/response'
import { generateDownloadUrl } from '../s3'
import { detectCategory, VALID_CATEGORIES } from '../categorize'
import { createDocumentRecord } from '../repository'
import { invokeDocumentProcessor } from '../processor-invoke'

interface CreateDocumentBody {
  /** UUID returned by POST /api/documents/presigned-url */
  docId: string
  /** S3 key returned by POST /api/documents/presigned-url */
  s3Key: string
  title: string
  fileName: string
  fileType: string
  fileSizeBytes?: number
  /** Category — if omitted or invalid the auto-detected category is used */
  category?: string
  description?: string
}

/**
 * POST /api/documents
 *
 * Called AFTER the browser has uploaded the file directly to S3 using the
 * presigned PUT URL from POST /api/documents/presigned-url.
 * Creates the database record and returns the new document with a download URL.
 */
export async function handleCreateDocument(
  body: string | null,
  hoaId: string,
  userId: string,
  role: string,
): Promise<r.ApiResponse> {
  if (role !== 'board_admin' && role !== 'board_member') {
    return r.forbidden('Only board members can upload documents')
  }
  if (!body) return r.badRequest('Request body required')

  let input: CreateDocumentBody
  try { input = JSON.parse(body) as CreateDocumentBody } catch { return r.badRequest('Invalid JSON') }

  if (!input.docId?.trim())    return r.badRequest('docId is required')
  if (!input.s3Key?.trim())    return r.badRequest('s3Key is required')
  if (!input.title?.trim())    return r.badRequest('title is required')
  if (!input.fileName?.trim()) return r.badRequest('fileName is required')

  // Validate s3Key starts with documents/{hoaId}/ to prevent path traversal
  if (!input.s3Key.startsWith(`documents/${hoaId}/`)) {
    return r.badRequest('Invalid s3Key: must belong to this HOA')
  }

  const autoCategory = detectCategory(input.fileName, input.title)
  const category = input.category && VALID_CATEGORIES.includes(input.category as never)
    ? input.category
    : autoCategory

  // Generate a download URL to return in the response
  const downloadUrl = await generateDownloadUrl(input.s3Key, input.fileName)

  const doc = await createDocumentRecord({
    id: input.docId.trim(),
    hoaId,
    title: input.title.trim(),
    description: input.description?.trim() ?? null,
    category,
    autoCategory,
    s3Key: input.s3Key.trim(),
    fileUrl: downloadUrl, // stored for legacy compatibility; regenerated on each list/download
    fileName: input.fileName.trim(),
    fileSizeBytes: input.fileSizeBytes ?? null,
    fileType: input.fileType?.trim() ?? null,
    uploadedBy: userId,
    source: 'upload',
    originalUrl: null,
  })

  if (!doc) return r.serverError('Failed to create document')

  // Trigger AI processing asynchronously — fire-and-forget, doesn't block response
  invokeDocumentProcessor({
    docId: doc.id,
    s3Key: input.s3Key.trim(),
    hoaId,
    fileType: input.fileType?.trim() ?? '',
    fileName: input.fileName.trim(),
    title: input.title.trim(),
    category: doc.category,
  }).catch(err => console.error('[create-document] Failed to invoke processor:', err))

  return r.created({ ...doc, downloadUrl })
}
