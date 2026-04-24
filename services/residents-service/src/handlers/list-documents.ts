import type { LambdaEvent } from '../../../shared/types'
import * as r from '../../../shared/response'
import { listDocuments } from '../repository'

export async function handleListDocuments(event: LambdaEvent, hoaId: string): Promise<r.ApiResponse> {
  const category = event.queryStringParameters?.category ?? undefined
  const docs = await listDocuments(hoaId, category)
  return r.ok(docs)
}
