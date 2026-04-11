import { query, queryOne, execute, param } from '../../shared/db/client'
import type { Resident, CreateResidentInput, UpdateResidentInput } from './types'

const RESIDENT_SELECT = `
  SELECT o.id, o.hoa_id, o.email, o.first_name, o.last_name, o.role,
         o.unit_id, u.unit_number, o.phone, o.avatar_url, o.created_at, o.updated_at
  FROM owners o
  LEFT JOIN units u ON u.id = o.unit_id`

export async function listResidents(hoaId: string): Promise<Resident[]> {
  return query<Resident>(
    `${RESIDENT_SELECT}
     WHERE o.hoa_id = :hoaId
     ORDER BY o.last_name ASC, o.first_name ASC`,
    [param.string('hoaId', hoaId)],
  )
}

export async function getResident(hoaId: string, residentId: string): Promise<Resident | null> {
  return queryOne<Resident>(
    `${RESIDENT_SELECT} WHERE o.id = :residentId AND o.hoa_id = :hoaId`,
    [param.string('residentId', residentId), param.string('hoaId', hoaId)],
  )
}

export async function findUnit(hoaId: string, unitNumber: string): Promise<{ id: string } | null> {
  return queryOne<{ id: string }>(
    'SELECT id FROM units WHERE hoa_id = :hoaId AND unit_number = :unitNumber',
    [param.string('hoaId', hoaId), param.string('unitNumber', unitNumber)],
  )
}

export async function createResident(hoaId: string, input: CreateResidentInput, unitId: string | null): Promise<Resident | null> {
  const row = await queryOne<{ id: string }>(
    `INSERT INTO owners (id, hoa_id, email, first_name, last_name, role, unit_id, phone)
     VALUES (gen_random_uuid(), :hoaId, :email, :firstName, :lastName, :role, :unitId, :phone)
     RETURNING id`,
    [
      param.string('hoaId', hoaId),
      param.string('email', input.email),
      param.string('firstName', input.firstName),
      param.string('lastName', input.lastName),
      param.string('role', input.role),
      param.stringOrNull('unitId', unitId),
      param.stringOrNull('phone', input.phone),
    ],
  )
  if (!row?.id) return null
  return getResident(hoaId, row.id)
}

export async function updateResident(
  hoaId: string,
  residentId: string,
  input: UpdateResidentInput,
  callerRole: string,
): Promise<Resident | null> {
  const setParts: string[] = ['updated_at = NOW()']
  const params = [param.string('residentId', residentId), param.string('hoaId', hoaId)]

  if (input.firstName !== undefined) { setParts.push('first_name = :firstName'); params.push(param.string('firstName', input.firstName)) }
  if (input.lastName !== undefined) { setParts.push('last_name = :lastName'); params.push(param.string('lastName', input.lastName)) }
  if (input.phone !== undefined) { setParts.push('phone = :phone'); params.push(param.stringOrNull('phone', input.phone)) }
  // Only board admins can change roles
  if (input.role !== undefined && callerRole === 'board_admin') {
    setParts.push('role = :role')
    params.push(param.string('role', input.role))
  }

  await execute(
    `UPDATE owners SET ${setParts.join(', ')} WHERE id = :residentId AND hoa_id = :hoaId`,
    params,
  )
  return getResident(hoaId, residentId)
}
