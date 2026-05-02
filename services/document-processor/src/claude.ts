/**
 * Claude AI integration for document analysis.
 * Generates a plain-language summary and key points from extracted text.
 */

import Anthropic from '@anthropic-ai/sdk'
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager'

let _apiKey: string | null = null

async function getApiKey(): Promise<string | null> {
  if (_apiKey) return _apiKey

  const secretArn = process.env.ANTHROPIC_SECRET_ARN
  if (!secretArn) {
    console.warn('[claude] ANTHROPIC_SECRET_ARN not set — AI processing skipped')
    return null
  }

  try {
    const sm = new SecretsManagerClient({ region: process.env.AWS_REGION ?? 'us-east-1' })
    const res = await sm.send(new GetSecretValueCommand({ SecretId: secretArn }))
    const value = res.SecretString?.trim()
    if (!value || value === 'REPLACE_ME' || !value.startsWith('sk-')) {
      console.warn('[claude] Anthropic API key not configured — AI processing skipped')
      return null
    }
    _apiKey = value
    return _apiKey
  } catch (err) {
    console.error('[claude] Failed to fetch Anthropic API key:', err)
    return null
  }
}

export interface AiAnalysis {
  summary: string
  keyPoints: string[]
}

const SYSTEM_PROMPT = `You are an expert at analyzing HOA (Homeowners Association) documents.
Your task is to help residents understand important documents clearly and concisely.
Always respond in plain, friendly language that any homeowner can understand.
Never add information not present in the document.`

/**
 * Analyze a document and produce a summary + key points using Claude.
 * Returns null if the API key is not configured or on error.
 */
export async function analyzeDocument(
  title: string,
  category: string,
  extractedText: string,
): Promise<AiAnalysis | null> {
  const apiKey = await getApiKey()
  if (!apiKey) return null

  if (!extractedText?.trim()) return null

  const client = new Anthropic({ apiKey })

  try {
    const message = await client.messages.create({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Please analyze the following HOA document and provide:
1. A SUMMARY section: 2-3 short paragraphs covering the main topics and key provisions in plain language
2. A KEY_POINTS section: 5-10 concise bullet points (as a JSON array of strings)

Format your response EXACTLY as:
SUMMARY:
<your summary here>

KEY_POINTS:
["point 1", "point 2", "point 3", ...]

Document Title: ${title}
Category: ${category}

Document Content:
${extractedText}`,
        },
      ],
    })

    const content = message.content[0]
    if (content.type !== 'text') return null

    const text = content.text

    // Parse summary
    const summaryMatch = text.match(/SUMMARY:\s*([\s\S]+?)(?=KEY_POINTS:|$)/i)
    const summary = summaryMatch ? summaryMatch[1].trim() : ''

    // Parse key points JSON array
    const keyPointsMatch = text.match(/KEY_POINTS:\s*(\[[\s\S]*?\])/i)
    let keyPoints: string[] = []
    if (keyPointsMatch) {
      try {
        keyPoints = JSON.parse(keyPointsMatch[1]) as string[]
      } catch {
        // Fall back to line-by-line parsing
        keyPoints = text
          .split('\n')
          .filter(l => /^[-•*]\s/.test(l.trim()) || /^\d+\.\s/.test(l.trim()))
          .map(l => l.replace(/^[-•*\d.]\s+/, '').trim())
          .filter(Boolean)
          .slice(0, 10)
      }
    }

    if (!summary && keyPoints.length === 0) return null

    return { summary, keyPoints }
  } catch (err) {
    console.error('[claude] analyzeDocument failed:', err)
    return null
  }
}

// ─── Unit extraction ─────────────────────────────────────────────────────────

export interface ExtractedUnitRow {
  unitNumber: string
  address?: string
  ownerName?: string
  ownerEmail?: string
  ownerPhone?: string
  sqft?: number
  bedrooms?: number
  bathrooms?: number
  ownershipPercent?: number
}

/**
 * Use Claude to extract unit / resident assignment data from a document's text.
 * Returns an array of rows the caller can review and import.
 */
export async function extractUnitsFromDocument(
  extractedText: string,
): Promise<ExtractedUnitRow[]> {
  const apiKey = await getApiKey()
  if (!apiKey) return []
  if (!extractedText?.trim()) return []

  const client = new Anthropic({ apiKey })

  try {
    const message = await client.messages.create({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 4096,
      system: `You are a data-extraction assistant for HOA management software.
Extract structured unit and resident information from documents.
Always return valid JSON. If a field is not present in the document, omit it from the object.`,
      messages: [
        {
          role: 'user',
          content: `Extract all unit / resident information from the HOA document below.

Return ONLY a JSON array where each element is an object with these optional fields:
- unitNumber (string, required — the unit identifier e.g. "101", "A2", "Unit 3")
- address (string — street address of the unit if present)
- ownerName (string — full name of the owner/resident)
- ownerEmail (string — email address)
- ownerPhone (string — phone number)
- sqft (number — square footage as integer)
- bedrooms (number — integer)
- bathrooms (number — decimal, e.g. 1.5)
- ownershipPercent (number — fractional ownership as decimal percentage e.g. 5.0)

If you find no unit data, return an empty array [].
Do NOT wrap the JSON in markdown code fences.

Document:
${extractedText.slice(0, 60_000)}`,
        },
      ],
    })

    const content = message.content[0]
    if (content.type !== 'text') return []

    // Strip optional markdown fences
    const raw = content.text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '')

    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []

    return (parsed as ExtractedUnitRow[]).filter(r =>
      r && typeof r === 'object' && typeof r.unitNumber === 'string' && r.unitNumber.trim(),
    )
  } catch (err) {
    console.error('[claude] extractUnitsFromDocument failed:', err)
    return []
  }
}

// ─── Package label parsing ────────────────────────────────────────────────────

export type LabelCarrier = 'USPS' | 'FedEx' | 'UPS' | 'Amazon' | 'DHL' | 'OnTrac' | 'Other'

export interface ParsedPackageLabel {
  carrier: LabelCarrier
  trackingNumber?: string
  recipientName?: string
  recipientAddress?: string
  senderName?: string
}

/**
 * Use Claude vision to extract structured package information from a label photo.
 * Accepts a base64-encoded image (JPEG/PNG/WebP) and returns parsed fields.
 */
export async function parsePackageLabel(
  imageBase64: string,
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif',
): Promise<ParsedPackageLabel | null> {
  const apiKey = await getApiKey()
  if (!apiKey) return null

  const client = new Anthropic({ apiKey })

  try {
    const message = await client.messages.create({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 512,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mediaType, data: imageBase64 },
            },
            {
              type: 'text',
              text: `Extract shipping information from this package label photo.
Return ONLY a JSON object with these fields (omit any field not visible):
- carrier: one of "USPS", "FedEx", "UPS", "Amazon", "DHL", "OnTrac", "Other"
- trackingNumber: the full tracking number as a string (no spaces)
- recipientName: the name of the person or company the package is addressed to
- recipientAddress: the delivery address (single line)
- senderName: the sender / return name if visible

Do NOT wrap the JSON in markdown code fences. Return raw JSON only.`,
            },
          ],
        },
      ],
    })

    const content = message.content[0]
    if (content.type !== 'text') return null

    const raw = content.text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '')
    const parsed = JSON.parse(raw) as ParsedPackageLabel

    // Normalise carrier to known values
    const known: LabelCarrier[] = ['USPS', 'FedEx', 'UPS', 'Amazon', 'DHL', 'OnTrac']
    const upperCarrier = (parsed.carrier as string)?.toUpperCase?.()
    if (!known.some(c => c.toUpperCase() === upperCarrier)) {
      parsed.carrier = 'Other'
    } else {
      // Preserve original casing for known carriers
      parsed.carrier = known.find(c => c.toUpperCase() === upperCarrier) ?? 'Other'
    }

    return parsed
  } catch (err) {
    console.error('[claude] parsePackageLabel failed:', err)
    return null
  }
}

/**
 * Answer a resident's question using the provided HOA document context.
 */
export async function answerQuestion(
  question: string,
  hoaName: string,
  documents: Array<{ title: string; category: string; text: string }>,
): Promise<{ answer: string; sourceCount: number } | null> {
  const apiKey = await getApiKey()
  if (!apiKey) return null
  if (documents.length === 0) return null

  const client = new Anthropic({ apiKey })

  // Build document context — cap total at 100K chars
  let totalChars = 0
  const docContext = documents
    .filter(d => d.text?.trim())
    .map(d => {
      const chunk = d.text.slice(0, 15_000)
      totalChars += chunk.length
      return `--- ${d.title} (${d.category}) ---\n${chunk}`
    })
    .filter(() => totalChars <= 100_000)
    .join('\n\n')

  if (!docContext.trim()) return null

  try {
    const message = await client.messages.create({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 1500,
      system: `You are a helpful assistant for ${hoaName} HOA residents.
Answer questions based ONLY on the provided HOA documents.
Be clear, friendly, and specific. Cite document names when relevant.
If the answer is not in the documents, say so honestly.`,
      messages: [
        {
          role: 'user',
          content: `HOA Documents:\n\n${docContext}\n\nResident Question: ${question}`,
        },
      ],
    })

    const content = message.content[0]
    if (content.type !== 'text') return null

    return {
      answer: content.text.trim(),
      sourceCount: documents.length,
    }
  } catch (err) {
    console.error('[claude] answerQuestion failed:', err)
    return null
  }
}
