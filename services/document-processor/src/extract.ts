/**
 * Text extraction utilities for the document processor.
 * Supports PDF (via pdf-parse) and plain text files.
 * Other types (Word, Excel, images) are skipped gracefully.
 */

// Max characters to feed into Claude — keeps costs predictable and avoids
// context overflow on very large documents.
const MAX_CHARS = 80_000

export interface ExtractResult {
  text: string
  pageCount?: number
  skipped: boolean
  skipReason?: string
}

/**
 * Extract plain text from a file buffer.
 * Returns { skipped: true } for unsupported types so the caller
 * can still create the DB record without AI fields.
 */
export async function extractText(
  buffer: Buffer,
  contentType: string,
  fileName: string,
): Promise<ExtractResult> {
  const lowerType = (contentType ?? '').toLowerCase()
  const lowerName = (fileName ?? '').toLowerCase()

  // ── PDF ───────────────────────────────────────────────────────────────────
  if (lowerType === 'application/pdf' || lowerName.endsWith('.pdf')) {
    try {
      // Dynamically import pdf-parse to avoid issues with the test-file check
      // it does at module load time in some environments.
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const pdfParse = require('pdf-parse') as (
        data: Buffer,
        options?: { max?: number }
      ) => Promise<{ text: string; numpages: number }>

      const result = await pdfParse(buffer, { max: 0 }) // 0 = all pages
      const text = result.text.replace(/\s+/g, ' ').trim()
      return {
        text: text.slice(0, MAX_CHARS),
        pageCount: result.numpages,
        skipped: false,
      }
    } catch (err) {
      console.error('[extract] pdf-parse failed:', err)
      return { text: '', skipped: true, skipReason: 'PDF parsing failed' }
    }
  }

  // ── Plain text ────────────────────────────────────────────────────────────
  if (
    lowerType === 'text/plain' ||
    lowerName.endsWith('.txt') ||
    lowerName.endsWith('.csv')
  ) {
    const text = buffer.toString('utf-8').replace(/\s+/g, ' ').trim()
    return { text: text.slice(0, MAX_CHARS), skipped: false }
  }

  // ── Unsupported (Word, Excel, images, etc.) ───────────────────────────────
  return {
    text: '',
    skipped: true,
    skipReason: `Unsupported type: ${contentType}`,
  }
}
