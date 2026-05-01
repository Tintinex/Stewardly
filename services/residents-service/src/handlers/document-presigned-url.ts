import { randomUUID } from 'crypto'
import * as r from '../../../shared/response'
import { generateUploadUrl, makeDocumentKey } from '../s3'
import { detectCategory } from '../categorize'

const ALLOWED_MIME_TYPES: Record<string, string> = {
  'application/pdf':                                                          'pdf',
  'application/msword':                                                       'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document':  'docx',
  'application/vnd.ms-excel':                                                 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':        'xlsx',
  'application/vnd.ms-powerpoint':                                            'ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation':'pptx',
  'image/jpeg':                                                               'jpg',
  'image/png':                                                                'png',
  'image/gif':                                                                'gif',
  'image/webp':                                                               'webp',
  'text/plain':                                                               'txt',
}

/**
 * POST /api/documents/presigned-url
 *
 * Returns a short-lived S3 pre-signed PUT URL.
 * The browser uploads the file directly to S3 (no Lambda memory required),
 * then calls POST /api/documents with the returned s3Key to create the DB record.
 *
 * Body: { fileName: string, contentType: string, title?: string }
 * Response: { uploadUrl: string, s3Key: string, expiresIn: number, suggestedCategory: string }
 */
export async function handleDocumentPresignedUrl(
  body: string | null,
  hoaId: string,
  role: string,
): Promise<r.ApiResponse> {
  if (role !== 'board_admin' && role !== 'board_member') {
    return r.forbidden('Only board members can upload documents')
  }
  if (!body) return r.badRequest('Request body required')

  let input: { fileName: string; contentType: string; title?: string }
  try { input = JSON.parse(body) } catch { return r.badRequest('Invalid JSON') }

  if (!input.fileName?.trim()) return r.badRequest('fileName is required')
  if (!input.contentType?.trim()) return r.badRequest('contentType is required')
  if (!ALLOWED_MIME_TYPES[input.contentType]) {
    return r.badRequest(`Unsupported file type: ${input.contentType}`)
  }

  const docId    = randomUUID()
  const s3Key    = makeDocumentKey(hoaId, docId, input.fileName.trim())
  const uploadUrl = await generateUploadUrl(s3Key, input.contentType)
  const suggestedCategory = detectCategory(input.fileName, input.title ?? '')

  return r.ok({ uploadUrl, s3Key, docId, expiresIn: 300, suggestedCategory })
}
