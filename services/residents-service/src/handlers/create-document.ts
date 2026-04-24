import * as r from '../../../shared/response'
import { createDocument } from '../repository'

interface CreateDocumentBody {
  title: string
  description?: string
  category: string
  fileUrl: string
  fileName: string
  fileSizeBytes?: number
}

const VALID_CATEGORIES = ['general', 'financial', 'legal', 'meeting_minutes', 'rules', 'forms']

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

  const input = JSON.parse(body) as CreateDocumentBody
  if (!input.title?.trim()) return r.badRequest('title is required')
  if (!input.fileUrl?.trim()) return r.badRequest('fileUrl is required')
  if (!input.fileName?.trim()) return r.badRequest('fileName is required')
  if (!input.category || !VALID_CATEGORIES.includes(input.category)) {
    return r.badRequest(`category must be one of: ${VALID_CATEGORIES.join(', ')}`)
  }

  const doc = await createDocument({
    hoaId,
    title: input.title.trim(),
    description: input.description?.trim() ?? null,
    category: input.category,
    fileUrl: input.fileUrl.trim(),
    fileName: input.fileName.trim(),
    fileSizeBytes: input.fileSizeBytes ?? null,
    uploadedBy: userId,
  })

  if (!doc) return r.serverError('Failed to create document')
  return r.created(doc)
}
