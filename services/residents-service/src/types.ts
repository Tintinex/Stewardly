export interface Resident {
  id: string
  hoaId: string
  email: string
  firstName: string
  lastName: string
  role: 'homeowner' | 'board_member' | 'board_admin'
  unitId: string | null
  unitNumber: string | null
  phone: string | null
  avatarUrl: string | null
  createdAt: string
  updatedAt: string
}

export interface CreateResidentInput {
  firstName: string
  lastName: string
  email: string
  phone: string | null
  role: 'homeowner' | 'board_member' | 'board_admin'
  unitNumber: string
}

export interface UpdateResidentInput {
  firstName?: string
  lastName?: string
  phone?: string | null
  role?: 'homeowner' | 'board_member' | 'board_admin'
  /** unitId to assign (UUID) or null to unassign — board members only */
  unitId?: string | null
}
