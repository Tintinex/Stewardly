/**
 * POST /api/documents/ask
 *
 * Answers a resident's question using the HOA's document library.
 * Available to all authenticated HOA members (homeowners and board).
 *
 * Body: { question: string, category?: string }
 * Response: { answer: string, sourceTitles: string[], hasDocuments: boolean }
 */

import * as r from '../../../shared/response'
import { getDocumentsForQA, getHoaName } from '../repository'
import { answerQuestion } from '../../../document-processor/src/claude'

export async function handleAskDocuments(
  body: string | null,
  hoaId: string,
): Promise<r.ApiResponse> {
  if (!body) return r.badRequest('Request body required')

  let input: { question: string; category?: string }
  try { input = JSON.parse(body) } catch { return r.badRequest('Invalid JSON') }

  const question = input.question?.trim()
  if (!question) return r.badRequest('question is required')
  if (question.length > 1000) return r.badRequest('question must be under 1000 characters')

  // Fetch relevant documents
  const docs = await getDocumentsForQA(hoaId, input.category)
  if (docs.length === 0) {
    return r.ok({
      answer: 'No documents with searchable content are available yet. Once board members upload documents, I\'ll be able to answer questions about your HOA rules, bylaws, and policies.',
      sourceTitles: [],
      hasDocuments: false,
    })
  }

  const hoaName = await getHoaName(hoaId)
  const result = await answerQuestion(question, hoaName, docs)

  if (!result) {
    return r.ok({
      answer: 'I\'m unable to process your question right now. The AI assistant may not be configured. Please contact your board for more information.',
      sourceTitles: docs.map(d => d.title),
      hasDocuments: true,
    })
  }

  return r.ok({
    answer: result.answer,
    sourceTitles: docs.map(d => d.title),
    hasDocuments: true,
  })
}
