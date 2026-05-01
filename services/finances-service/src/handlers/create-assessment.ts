import * as r from '../../../shared/response'
import * as repo from '../repository'
import type { CreateAssessmentInput } from '../types'

/** POST /api/finances/assessments */
export async function handleCreateAssessment(body: string | null, hoaId: string, role: string): Promise<r.ApiResponse> {
  if (role !== 'board_admin' && role !== 'board_member') {
    return r.forbidden('Only board members can create assessments')
  }
  if (!body) return r.badRequest('Request body is required')

  let parsed: CreateAssessmentInput
  try {
    parsed = JSON.parse(body) as CreateAssessmentInput
  } catch {
    return r.badRequest('Invalid JSON')
  }

  if (!parsed.unitId) return r.badRequest('unitId is required')
  if (typeof parsed.amount !== 'number' || parsed.amount <= 0) return r.badRequest('amount must be a positive number')
  if (!parsed.description?.trim()) return r.badRequest('description is required')
  if (!parsed.dueDate) return r.badRequest('dueDate is required')

  const assessment = await repo.createAssessment(hoaId, parsed)
  return r.created(assessment)
}

/** POST /api/finances/assessments/bulk — create one assessment per unit */
export async function handleBulkAssessments(body: string | null, hoaId: string, role: string): Promise<r.ApiResponse> {
  if (role !== 'board_admin' && role !== 'board_member') {
    return r.forbidden('Only board members can create bulk assessments')
  }
  if (!body) return r.badRequest('Request body is required')

  let parsed: { amount?: number; description?: string; dueDate?: string; notes?: string }
  try {
    parsed = JSON.parse(body)
  } catch {
    return r.badRequest('Invalid JSON')
  }

  if (typeof parsed.amount !== 'number' || parsed.amount <= 0) return r.badRequest('amount must be a positive number')
  if (!parsed.description?.trim()) return r.badRequest('description is required')
  if (!parsed.dueDate) return r.badRequest('dueDate is required')

  const result = await repo.bulkCreateAssessments(hoaId, parsed.amount, parsed.description, parsed.dueDate, parsed.notes)
  return r.created(result)
}
