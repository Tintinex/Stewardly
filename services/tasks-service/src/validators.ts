import type { CreateTaskInput, UpdateTaskInput } from './types'

const VALID_PRIORITIES = ['low', 'medium', 'high'] as const
const VALID_STATUSES = ['todo', 'in_progress', 'done'] as const

/** Returns a CreateTaskInput on success, or an error message string on failure. */
export function parseCreateInput(raw: unknown): CreateTaskInput | string {
  if (!raw || typeof raw !== 'object') return 'Request body must be a JSON object'
  const b = raw as Record<string, unknown>

  if (!b.title || typeof b.title !== 'string' || !b.title.trim()) {
    return 'title is required'
  }
  if (b.priority !== undefined && !VALID_PRIORITIES.includes(b.priority as never)) {
    return `priority must be one of: ${VALID_PRIORITIES.join(', ')}`
  }

  return {
    title: (b.title as string).trim(),
    description: typeof b.description === 'string' ? b.description : null,
    priority: (b.priority as CreateTaskInput['priority']) ?? 'medium',
    assigneeId: typeof b.assigneeId === 'string' ? b.assigneeId : null,
    dueDate: typeof b.dueDate === 'string' ? b.dueDate : null,
  }
}

/** Returns an UpdateTaskInput on success, or an error message string on failure. */
export function parseUpdateInput(raw: unknown): UpdateTaskInput | string {
  if (!raw || typeof raw !== 'object') return 'Request body must be a JSON object'
  const b = raw as Record<string, unknown>

  if (b.status !== undefined && !VALID_STATUSES.includes(b.status as never)) {
    return `status must be one of: ${VALID_STATUSES.join(', ')}`
  }
  if (b.priority !== undefined && !VALID_PRIORITIES.includes(b.priority as never)) {
    return `priority must be one of: ${VALID_PRIORITIES.join(', ')}`
  }

  return {
    title: typeof b.title === 'string' ? b.title : undefined,
    description: 'description' in b ? (b.description as string | null) : undefined,
    status: b.status as UpdateTaskInput['status'],
    priority: b.priority as UpdateTaskInput['priority'],
    assigneeId: 'assigneeId' in b ? (b.assigneeId as string | null) : undefined,
    dueDate: 'dueDate' in b ? (b.dueDate as string | null) : undefined,
  }
}
