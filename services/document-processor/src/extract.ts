/**
 * Text extraction utilities for the document processor.
 *
 * PDFs are handled natively by Claude's document API (no pdf-parse — avoids
 * the DOMMatrix / browser-API issues that crash pdf-parse in Lambda).
 * Plain-text and CSV files are decoded directly from the buffer.
 * All other types (Word, Excel, images) are skipped gracefully.
 */

// Max characters for plain-text files fed into Claude.
const MAX_CHARS = 80_000

export interface ExtractResult {
  /** Raw text — empty string when skipped or when a PDF (handled by Claude). */
  text: string
  /** True when this is a PDF that Claude should receive as a native document. */
  isPdf?: boolean
  skipped: boolean
  skipReason?: string
}

/**
 * Classify the file and extract text where possible.
 *
 * - PDFs   → { isPdf: true, text: '' }  (caller passes buffer to Claude directly)
 * - Text   → { text: '<content>' }
 * - Other  → { skipped: true }
 */
export function extractText(
  buffer: Buffer,
  contentType: string,
  fileName: string,
): ExtractResult {
  const lowerType = (contentType ?? '').toLowerCase()
  const lowerName = (fileName ?? '').toLowerCase()

  // ── PDF — let Claude read it natively ────────────────────────────────────
  if (lowerType === 'application/pdf' || lowerName.endsWith('.pdf')) {
    return { text: '', isPdf: true, skipped: false }
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
