import * as r from '../../../shared/response'
import { generateDownloadUrl } from '../s3'
import { getDocumentById } from '../repository'

/**
 * GET /api/documents/:documentId/download
 *
 * Returns a fresh 7-day presigned S3 GET URL for a private document.
 * The frontend should call this when the user clicks "Download" — it
 * generates a new URL every time rather than storing expiring URLs in the DB.
 */
export async function handleDocumentDownload(
  documentId: string,
  hoaId: string,
): Promise<r.ApiResponse> {
  const doc = await getDocumentById(documentId, hoaId)
  if (!doc) return r.notFound('Document')

  if (!doc.s3Key) {
    // Legacy document with a plain file_url (pre-V007)
    return r.ok({ downloadUrl: doc.fileUrl, legacy: true })
  }

  const downloadUrl = await generateDownloadUrl(doc.s3Key, doc.fileName)
  return r.ok({ downloadUrl })
}
