import type { CreateResidentInput, UpdateResidentInput } from './types'

const VALID_ROLES = ['homeowner', 'board_member', 'board_admin'] as const

export function parseCreateInput(raw: unknown): CreateResidentInput | string {
  if (!raw || typeof raw !== 'object') return 'Request body must be a JSON object'
  const b = raw as Record<string, unknown>

  if (!b.firstName || typeof b.firstName !== 'string' || !b.firstName.trim()) return 'firstName is required'
  if (!b.lastName || typeof b.lastName !== 'string' || !b.lastName.trim()) return 'lastName is required'
  if (!b.email || typeof b.email !== 'string' || !b.email.trim()) return 'email is required'
  if (!b.unitNumber || typeof b.unitNumber !== 'string' || !b.unitNumber.trim()) return 'unitNumber is required'
  if (b.role !== undefined && !VALID_ROLES.includes(b.role as never)) {
    return `role must be one of: ${VALID_ROLES.join(', ')}`
  }

  return {
    firstName: (b.firstName as string).trim(),
    lastName: (b.lastName as string).trim(),
    email: (b.email as string).trim().toLowerCase(),
    phone: typeof b.phone === 'string' ? b.phone : null,
    role: (b.role as CreateResidentInput['role']) ?? 'homeowner',
    unitNumber: (b.unitNumber as string).trim(),
  }
}

export function parseUpdateInput(raw: unknown): UpdateResidentInput | string {
  if (!raw || typeof raw !== 'object') return 'Request body must be a JSON object'
  const b = raw as Record<string, unknown>

  if (b.role !== undefined && !VALID_ROLES.includes(b.role as never)) {
    return `role must be one of: ${VALID_ROLES.join(', ')}`
  }

  return {
    firstName: typeof b.firstName === 'string' ? b.firstName.trim() : undefined,
    lastName: typeof b.lastName === 'string' ? b.lastName.trim() : undefined,
    phone: 'phone' in b ? (b.phone as string | null) : undefined,
    role: b.role as UpdateResidentInput['role'],
  }
}
