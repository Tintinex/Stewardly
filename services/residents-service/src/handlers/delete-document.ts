import * as r from '../../../shared/response'
import { deleteObject } from '../s3'
import { getDocumentById, softDeleteDocument, getOwnerIdByCognitoSub } from '../repository'

/**
 * DELETE /api/documents/:documentId
 *
 * Board admins can delete any document in their HOA.
 * Board members can only delete documents they uploaded.
 * Soft-deletes the DB record and removes the S3 object.
 */
export async function handleDeleteDocument(
  documentId: string,
  hoaId: string,
  userId: string,
  role: string,
): Promise<r.ApiResponse> {
  if (role !== 'board_admin' && role !== 'board_member') {
    return r.forbidden('Only board members can delete documents')
  }

  const doc = await getDocumentById(documentId, hoaId)
  if (!doc) return r.notFound('Document')

  // Board members can only delete their own uploads.
  // doc.uploadedBy is an owners.id UUID; resolve the caller's owners.id for comparison.
  if (role === 'board_member') {
    const ownerId = await getOwnerIdByCognitoSub(hoaId, userId)
    if (!ownerId || doc.uploadedBy !== ownerId) {
      return r.forbidden('You can only delete documents you uploaded')
    }
  }

  // Remove from S3 first (best-effort — don't block on failure)
  if (doc.s3Key) {
    try { await deleteObject(doc.s3Key) } catch (err) {
      console.error('[delete-document] S3 delete failed (continuing):', err)
    }
  }

  await softDeleteDocument(documentId, hoaId)
  return r.ok({ success: true })
}
