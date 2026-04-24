import { query, queryOne, execute, param } from '../../shared/db/client'
import type { Resident, CreateResidentInput, UpdateResidentInput } from './types'

// ── Ensure owner (upsert on signup) ─────────────────────────────────────────

export async function ensureOwner(input: {
  hoaId: string
  cognitoSub: string
  email: string
  firstName: string
  lastName: string
  phone: string | null
  unitNumber: string | null
}): Promise<Resident | null> {
  // Check if owner already exists by cognito_sub
  const existing = await queryOne<{ id: string; hoaId: string }>(
    'SELECT id, hoa_id FROM owners WHERE cognito_sub = :cognitoSub',
    [param.string('cognitoSub', input.cognitoSub)],
  )

  if (existing) {
    return getResident(existing.hoaId, existing.id)
  }

  // Resolve unit_id if unitNumber provided
  let unitId: string | null = null
  if (input.unitNumber && input.hoaId) {
    const unit = await findUnit(input.hoaId, input.unitNumber)
    unitId = unit?.id ?? null
  }

  // Insert new owner
  const row = await queryOne<{ id: string }>(
    `INSERT INTO owners (id, hoa_id, cognito_sub, email, first_name, last_name, role, unit_id, phone)
     VALUES (gen_random_uuid(), :hoaId, :cognitoSub, :email, :firstName, :lastName, 'homeowner', :unitId, :phone)
     RETURNING id`,
    [
      param.string('hoaId', input.hoaId),
      param.string('cognitoSub', input.cognitoSub),
      param.string('email', input.email),
      param.string('firstName', input.firstName),
      param.string('lastName', input.lastName),
      param.stringOrNull('unitId', unitId),
      param.stringOrNull('phone', input.phone),
    ],
  )
  if (!row?.id) return null
  return getResident(input.hoaId, row.id)
}

// ── My unit + assessments ────────────────────────────────────────────────────

export async function getMyUnit(hoaId: string, userId: string): Promise<{
  unit: Record<string, unknown>
  assessments: Record<string, unknown>[]
  ownerName: string
  hoaName: string
} | null> {
  const ownerRow = await queryOne<{
    id: string
    firstName: string
    lastName: string
    unitId: string | null
    hoaName: string
  }>(
    `SELECT o.id, o.first_name, o.last_name, o.unit_id, h.name AS hoa_name
     FROM owners o
     JOIN hoas h ON h.id = o.hoa_id
     WHERE o.cognito_sub = :userId AND o.hoa_id = :hoaId`,
    [param.string('userId', userId), param.string('hoaId', hoaId)],
  )

  if (!ownerRow || !ownerRow.unitId) return null

  const unit = await queryOne<Record<string, unknown>>(
    `SELECT u.id, u.unit_number, u.address, u.sqft, u.bedrooms, u.bathrooms
     FROM units u
     WHERE u.id = :unitId AND u.hoa_id = :hoaId`,
    [param.string('unitId', ownerRow.unitId), param.string('hoaId', hoaId)],
  )

  if (!unit) return null

  const assessments = await query<Record<string, unknown>>(
    `SELECT id, amount, due_date, paid_date, status, description, created_at
     FROM assessments
     WHERE unit_id = :unitId
     ORDER BY due_date DESC
     LIMIT 12`,
    [param.string('unitId', ownerRow.unitId)],
  )

  return {
    unit,
    assessments,
    ownerName: `${ownerRow.firstName} ${ownerRow.lastName}`,
    hoaName: ownerRow.hoaName,
  }
}

// ── Maintenance requests ─────────────────────────────────────────────────────

export async function getMaintenanceRequests(hoaId: string, userId: string, role: string): Promise<Record<string, unknown>[]> {
  const isBoardOrAdmin = role === 'board_admin' || role === 'board_member'

  if (isBoardOrAdmin) {
    // Board members see all requests for the HOA
    return query<Record<string, unknown>>(
      `SELECT mr.id, mr.hoa_id, mr.unit_id, mr.submitted_by,
              CONCAT(o.first_name, ' ', o.last_name) AS submitter_name,
              u.unit_number,
              mr.title, mr.description, mr.category, mr.priority,
              mr.status, mr.notes, mr.created_at, mr.updated_at
       FROM maintenance_requests mr
       LEFT JOIN owners o ON o.id = mr.submitted_by
       JOIN units u ON u.id = mr.unit_id
       WHERE mr.hoa_id = :hoaId
       ORDER BY mr.created_at DESC
       LIMIT 50`,
      [param.string('hoaId', hoaId)],
    )
  }

  // Homeowners see only their own unit's requests
  const ownerRow = await queryOne<{ unitId: string | null }>(
    'SELECT unit_id FROM owners WHERE cognito_sub = :userId AND hoa_id = :hoaId',
    [param.string('userId', userId), param.string('hoaId', hoaId)],
  )

  if (!ownerRow?.unitId) return []

  return query<Record<string, unknown>>(
    `SELECT mr.id, mr.hoa_id, mr.unit_id, mr.submitted_by,
            CONCAT(o.first_name, ' ', o.last_name) AS submitter_name,
            u.unit_number,
            mr.title, mr.description, mr.category, mr.priority,
            mr.status, mr.notes, mr.created_at, mr.updated_at
     FROM maintenance_requests mr
     LEFT JOIN owners o ON o.id = mr.submitted_by
     JOIN units u ON u.id = mr.unit_id
     WHERE mr.hoa_id = :hoaId AND mr.unit_id = :unitId
     ORDER BY mr.created_at DESC
     LIMIT 50`,
    [param.string('hoaId', hoaId), param.string('unitId', ownerRow.unitId)],
  )
}

export async function createMaintenanceRequest(input: {
  hoaId: string
  userId: string
  title: string
  description: string | null
  category: string
  priority: string
}): Promise<Record<string, unknown> | null> {
  // Resolve owner + unit
  const ownerRow = await queryOne<{ id: string; unitId: string | null }>(
    'SELECT id, unit_id FROM owners WHERE cognito_sub = :userId AND hoa_id = :hoaId',
    [param.string('userId', input.userId), param.string('hoaId', input.hoaId)],
  )

  if (!ownerRow) return null
  if (!ownerRow.unitId) return null

  const row = await queryOne<{ id: string }>(
    `INSERT INTO maintenance_requests
       (id, hoa_id, unit_id, submitted_by, title, description, category, priority, status)
     VALUES
       (gen_random_uuid(), :hoaId, :unitId, :submittedBy, :title, :description, :category, :priority, 'open')
     RETURNING id`,
    [
      param.string('hoaId', input.hoaId),
      param.string('unitId', ownerRow.unitId),
      param.string('submittedBy', ownerRow.id),
      param.string('title', input.title),
      param.stringOrNull('description', input.description),
      param.string('category', input.category),
      param.string('priority', input.priority),
    ],
  )

  if (!row?.id) return null

  return queryOne<Record<string, unknown>>(
    `SELECT mr.id, mr.hoa_id, mr.unit_id, mr.submitted_by,
            mr.title, mr.description, mr.category, mr.priority,
            mr.status, mr.notes, mr.created_at, mr.updated_at
     FROM maintenance_requests mr
     WHERE mr.id = :id`,
    [param.string('id', row.id)],
  )
}

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

// ── Documents ────────────────────────────────────────────────────────────────

export interface DocumentRecord {
  id: string
  hoaId: string
  title: string
  description: string | null
  category: string
  fileUrl: string
  fileName: string
  fileSizeBytes: number | null
  uploadedByName: string
  createdAt: string
}

export async function listDocuments(hoaId: string, category?: string): Promise<DocumentRecord[]> {
  const params = [param.string('hoaId', hoaId)]
  let sql = `
    SELECT d.id, d.hoa_id AS "hoaId", d.title, d.description, d.category,
           d.file_url AS "fileUrl", d.file_name AS "fileName",
           d.file_size_bytes AS "fileSizeBytes",
           CONCAT(o.first_name, ' ', o.last_name) AS "uploadedByName",
           d.created_at AS "createdAt"
    FROM documents d
    LEFT JOIN owners o ON o.id = d.uploaded_by
    WHERE d.hoa_id = :hoaId
  `
  if (category) {
    sql += ' AND d.category = :category'
    params.push(param.string('category', category))
  }
  sql += ' ORDER BY d.created_at DESC'
  return query<DocumentRecord>(sql, params)
}

export async function createDocument(input: {
  hoaId: string
  title: string
  description: string | null
  category: string
  fileUrl: string
  fileName: string
  fileSizeBytes: number | null
  uploadedBy: string
}): Promise<DocumentRecord | null> {
  const row = await queryOne<{ id: string }>(
    `INSERT INTO documents (id, hoa_id, title, description, category, file_url, file_name, file_size_bytes, uploaded_by)
     VALUES (gen_random_uuid(), :hoaId, :title, :description, :category, :fileUrl, :fileName, :fileSizeBytes, :uploadedBy)
     RETURNING id`,
    [
      param.string('hoaId', input.hoaId),
      param.string('title', input.title),
      param.stringOrNull('description', input.description),
      param.string('category', input.category),
      param.string('fileUrl', input.fileUrl),
      param.string('fileName', input.fileName),
      param.stringOrNull('fileSizeBytes', input.fileSizeBytes != null ? String(input.fileSizeBytes) : null),
      param.string('uploadedBy', input.uploadedBy),
    ],
  )
  if (!row?.id) return null
  const docs = await listDocuments(input.hoaId)
  return docs.find(d => d.id === row.id) ?? null
}
