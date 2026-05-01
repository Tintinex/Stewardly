import * as r from '../../../shared/response'
import * as repo from '../repository'

/** PATCH /api/finances/assessments/:assessmentId */
export async function handleUpdateAssessment(
  body: string | null,
  hoaId: string,
  assessmentId: string,
  role: string,
): Promise<r.ApiResponse> {
  if (role !== 'board_admin' && role !== 'board_member') {
    return r.forbidden('Only board members can update assessments')
  }
  if (!body) return r.badRequest('Request body is required')

  let parsed: { status?: string; paidDate?: string | null; notes?: string; amount?: number }
  try {
    parsed = JSON.parse(body)
  } catch {
    return r.badRequest('Invalid JSON')
  }

  if (parsed.status && !['pending', 'paid', 'overdue'].includes(parsed.status)) {
    return r.badRequest('status must be pending, paid, or overdue')
  }

  // Auto-set paidDate when marking as paid
  if (parsed.status === 'paid' && !parsed.paidDate) {
    parsed.paidDate = new Date().toISOString().split('T')[0]
  }

  // Clear paidDate when un-marking
  if (parsed.status === 'pending' || parsed.status === 'overdue') {
    parsed.paidDate = null
  }

  const assessment = await repo.updateAssessment(hoaId, assessmentId, parsed)
  if (!assessment) return r.notFound('Assessment not found')
  return r.ok(assessment)
}

/** DELETE /api/finances/assessments/:assessmentId */
export async function handleDeleteAssessment(hoaId: string, assessmentId: string, role: string): Promise<r.ApiResponse> {
  if (role !== 'board_admin' && role !== 'board_member') {
    return r.forbidden('Only board members can delete assessments')
  }
  await repo.deleteAssessment(hoaId, assessmentId)
  return r.ok({ message: 'Assessment deleted' })
}
