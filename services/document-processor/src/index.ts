/**
 * Document Processor Lambda
 *
 * Invoked asynchronously (InvocationType: 'Event') by the residents-service
 * after a document is uploaded to S3 and its DB record is created.
 *
 * Workflow:
 *   1. Receive { docId, s3Key, hoaId, fileType, fileName, title, category }
 *   2. Download file from S3
 *   3. Extract text (PDF / TXT)
 *   4. Call Claude for summary + key points
 *   5. Update documents table with extracted_text, ai_summary, ai_key_points
 */

import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3'
import { query, execute, param } from '../../shared/db/client'
import { extractText } from './extract'
import { analyzeDocument } from './claude'

const s3 = new S3Client({ region: process.env.AWS_REGION ?? 'us-east-1' })
const BUCKET = process.env.S3_BUCKET!

export interface ProcessDocumentEvent {
  docId: string
  s3Key: string
  hoaId: string
  fileType: string
  fileName: string
  title: string
  category: string
}

export const handler = async (event: ProcessDocumentEvent): Promise<void> => {
  const { docId, s3Key, fileType, fileName, title, category } = event

  console.log(`[document-processor] Processing doc ${docId} (${fileName})`)

  // ── Mark as processing ────────────────────────────────────────────────────
  await execute(
    `UPDATE documents SET processing_status = 'processing', updated_at = NOW()
     WHERE id = :docId`,
    [param.string('docId', docId)],
  ).catch(err => console.error('[document-processor] Failed to mark processing:', err))

  try {
    // ── Download from S3 ────────────────────────────────────────────────────
    const obj = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: s3Key }))
    const chunks: Uint8Array[] = []
    if (obj.Body) {
      for await (const chunk of obj.Body as AsyncIterable<Uint8Array>) {
        chunks.push(chunk)
      }
    }
    const buffer = Buffer.concat(chunks)

    // ── Extract text ────────────────────────────────────────────────────────
    const extraction = await extractText(buffer, fileType, fileName)

    if (extraction.skipped) {
      console.log(`[document-processor] Skipped text extraction: ${extraction.skipReason}`)
      await execute(
        `UPDATE documents
         SET processing_status = 'done', updated_at = NOW()
         WHERE id = :docId`,
        [param.string('docId', docId)],
      )
      return
    }

    // ── AI analysis ─────────────────────────────────────────────────────────
    const aiResult = await analyzeDocument(title, category, extraction.text)

    // ── Update DB ───────────────────────────────────────────────────────────
    await execute(
      `UPDATE documents
       SET
         extracted_text    = :extractedText,
         ai_summary        = :aiSummary,
         ai_key_points     = :aiKeyPoints::jsonb,
         processing_status = 'done',
         ai_processed_at   = NOW(),
         updated_at        = NOW()
       WHERE id = :docId`,
      [
        param.string('docId', docId),
        param.stringOrNull('extractedText', extraction.text || null),
        param.stringOrNull('aiSummary', aiResult?.summary ?? null),
        param.stringOrNull('aiKeyPoints', aiResult ? JSON.stringify(aiResult.keyPoints) : null),
      ],
    )

    console.log(`[document-processor] Done: doc ${docId}, text=${extraction.text.length} chars, ai=${aiResult ? 'yes' : 'no'}`)
  } catch (err) {
    console.error(`[document-processor] Error processing doc ${docId}:`, err)
    await execute(
      `UPDATE documents SET processing_status = 'error', updated_at = NOW() WHERE id = :docId`,
      [param.string('docId', docId)],
    ).catch(() => {/* ignore */})
  }
}
