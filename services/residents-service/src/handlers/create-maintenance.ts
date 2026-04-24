import * as r from '../../../shared/response'
import * as repo from '../repository'

/** POST /api/maintenance-requests */
export async function handleCreateMaintenance(body: string | null, hoaId: string, userId: string): Promise<r.ApiResponse> {
  if (!body) return r.badRequest('Request body is required')

  const parsed = JSON.parse(body) as {
    title?: string
    description?: string
    category?: string
    priority?: string
  }

  if (!parsed.title?.trim()) return r.badRequest('title is required')
  if (!parsed.category) return r.badRequest('category is required')

  const validCategories = ['plumbing', 'electrical', 'hvac', 'structural', 'landscaping', 'pest_control', 'common_area', 'other']
  if (!validCategories.includes(parsed.category)) {
    return r.badRequest(`category must be one of: ${validCategories.join(', ')}`)
  }

  const validPriorities = ['low', 'normal', 'urgent']
  if (parsed.priority && !validPriorities.includes(parsed.priority)) {
    return r.badRequest(`priority must be one of: ${validPriorities.join(', ')}`)
  }

  const request = await repo.createMaintenanceRequest({
    hoaId,
    userId,
    title: parsed.title.trim(),
    description: parsed.description ?? null,
    category: parsed.category,
    priority: parsed.priority ?? 'normal',
  })

  if (!request) return r.serverError('Failed to create maintenance request')

  return r.created(request)
}
