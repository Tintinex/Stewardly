import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { query, queryOne, execute, param } from '../../shared/db/client'
import type { Resident, CreateResidentInput, UpdateResidentInput } from './types'

const s3 = new S3Client({ region: process.env.AWS_REGION ?? 'us-east-1' })
const S3_BUCKET = process.env.S3_BUCKET ?? ''

// ── My Profile ───────────────────────────────────────────────────────────────

export interface OwnerProfile {
  id: string
  firstName: string
  lastName: string
  email: string
  phone: string | null
  role: string
  unitId: string | null
  unitNumber: string | null
  avatarUrl: string | null   // pre-signed GET URL, regenerated each request
  hoaId: string
  hoaName: string
}

export async function getMyProfile(hoaId: string, cognitoSub: string): Promise<OwnerProfile | null> {
  const row = await queryOne<{
    id: string
    firstName: string
    lastName: string
    email: string
    phone: string | null
    role: string
    unitId: string | null
    unitNumber: string | null
    avatarKey: string | null
    hoaId: string
    hoaName: string
  }>(
    `SELECT o.id, o.first_name AS "firstName", o.last_name AS "lastName",
            o.email, o.phone, o.role, o.unit_id AS "unitId",
            u.unit_number AS "unitNumber",
            o.avatar_url AS "avatarKey",
            o.hoa_id AS "hoaId", h.name AS "hoaName"
     FROM owners o
     JOIN hoas h ON h.id = o.hoa_id
     LEFT JOIN units u ON u.id = o.unit_id
     WHERE o.cognito_sub = :cognitoSub AND o.hoa_id = :hoaId`,
    [param.string('cognitoSub', cognitoSub), param.string('hoaId', hoaId)],
  )

  if (!row) return null

  // Generate a short-lived presigned GET URL if the owner has stored an avatar key
  let avatarUrl: string | null = null
  if (row.avatarKey && S3_BUCKET) {
    try {
      avatarUrl = await getSignedUrl(
        s3,
        new GetObjectCommand({ Bucket: S3_BUCKET, Key: row.avatarKey }),
        { expiresIn: 3600 }, // 1 hour
      )
    } catch {
      avatarUrl = null
    }
  }

  return {
    id: row.id,
    firstName: row.firstName,
    lastName: row.lastName,
    email: row.email,
    phone: row.phone,
    role: row.role,
    unitId: row.unitId,
    unitNumber: row.unitNumber,
    avatarUrl,
    hoaId: row.hoaId,
    hoaName: row.hoaName,
  }
}

export async function generateAvatarUploadUrl(hoaId: string, ownerId: string): Promise<{ uploadUrl: string; avatarKey: string }> {
  const avatarKey = `avatars/${hoaId}/${ownerId}/profile.jpg`
  const uploadUrl = await getSignedUrl(
    s3,
    new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: avatarKey,
      ContentType: 'image/jpeg',
    }),
    { expiresIn: 300 }, // 5 minutes to upload
  )
  return { uploadUrl, avatarKey }
}

export async function updateOwnerProfile(input: {
  hoaId: string
  cognitoSub: string
  avatarKey?: string
  firstName?: string
  lastName?: string
  phone?: string | null
}): Promise<void> {
  const setParts: string[] = ['updated_at = NOW()']
  const params: ReturnType<typeof param.string>[] = [
    param.string('cognitoSub', input.cognitoSub),
    param.string('hoaId', input.hoaId),
  ]

  if (input.avatarKey !== undefined) {
    setParts.push('avatar_url = :avatarKey')
    params.push(param.string('avatarKey', input.avatarKey))
  }
  if (input.firstName !== undefined) {
    setParts.push('first_name = :firstName')
    params.push(param.string('firstName', input.firstName))
  }
  if (input.lastName !== undefined) {
    setParts.push('last_name = :lastName')
    params.push(param.string('lastName', input.lastName))
  }
  if (input.phone !== undefined) {
    setParts.push('phone = :phone')
    params.push(param.stringOrNull('phone', input.phone))
  }

  await execute(
    `UPDATE owners SET ${setParts.join(', ')}
     WHERE cognito_sub = :cognitoSub AND hoa_id = :hoaId`,
    params,
  )
}

// ── Ensure owner (upsert on signup) ─────────────────────────────────────────

export async function ensureOwner(input: {
  hoaId: string
  cognitoSub: string
  email: string
  firstName: string
  lastName: string
  phone: string | null
  unitNumber: string | null
  role?: string
  inviteCode?: string | null
}): Promise<Resident | null> {
  // Check if owner already exists by cognito_sub
  const existing = await queryOne<{ id: string; hoaId: string }>(
    'SELECT id, hoa_id FROM owners WHERE cognito_sub = :cognitoSub',
    [param.string('cognitoSub', input.cognitoSub)],
  )

  if (existing) {
    // Update last_seen_at on every login
    await execute(
      'UPDATE owners SET last_seen_at = NOW() WHERE id = :id',
      [param.string('id', existing.id)],
    )
    return getResident(existing.hoaId, existing.id)
  }

  // Resolve unit_id if unitNumber provided
  let unitId: string | null = null
  if (input.unitNumber && input.hoaId) {
    const unit = await findUnit(input.hoaId, input.unitNumber)
    unitId = unit?.id ?? null
  }

  // Board roles are pre-approved; homeowners need admin approval
  const isBoardRole = input.role === 'board_admin' || input.role === 'board_member'
  const status = isBoardRole ? 'active' : 'pending'

  // Insert new owner
  const row = await queryOne<{ id: string }>(
    `INSERT INTO owners (id, hoa_id, cognito_sub, email, first_name, last_name, role, unit_id, phone, status, last_seen_at, joined_via_code)
     VALUES (gen_random_uuid(), :hoaId, :cognitoSub, :email, :firstName, :lastName, 'homeowner', :unitId, :phone, :status, NOW(), :inviteCode)
     RETURNING id`,
    [
      param.string('hoaId', input.hoaId),
      param.string('cognitoSub', input.cognitoSub),
      param.string('email', input.email),
      param.string('firstName', input.firstName),
      param.string('lastName', input.lastName),
      param.stringOrNull('unitId', unitId),
      param.stringOrNull('phone', input.phone),
      param.string('status', status),
      param.stringOrNull('inviteCode', input.inviteCode ?? null),
    ],
  )
  if (!row?.id) return null

  // Log membership event
  await execute(
    `INSERT INTO membership_events (id, hoa_id, owner_id, event_type, performed_by, notes)
     VALUES (gen_random_uuid(), :hoaId, :ownerId, :eventType, NULL, NULL)`,
    [
      param.string('hoaId', input.hoaId),
      param.string('ownerId', row.id),
      param.string('eventType', isBoardRole ? 'approved' : 'applied'),
    ],
  )

  // Log activity
  await execute(
    `INSERT INTO user_activity_log (id, hoa_id, owner_id, action, metadata, created_at)
     VALUES (gen_random_uuid(), :hoaId, :ownerId, 'signup', :metadata, NOW())`,
    [
      param.string('hoaId', input.hoaId),
      param.string('ownerId', row.id),
      param.string('metadata', JSON.stringify({ email: input.email, status })),
    ],
  )

  return getResident(input.hoaId, row.id)
}

// ── My unit + assessments ────────────────────────────────────────────────────

export async function getMyUnit(hoaId: string, userId: string): Promise<{
  owner: {
    id: string
    firstName: string
    lastName: string
    email: string
    phone: string | null
    role: string
    unitId: string | null
  }
  unit: Record<string, unknown> | null
  assessments: Record<string, unknown>[]
  hoaName: string
  hoaAddress: string
  hoaCity: string
  hoaState: string
  hoaZip: string
} | null> {
  const ownerRow = await queryOne<{
    id: string
    firstName: string
    lastName: string
    email: string
    phone: string | null
    role: string
    unitId: string | null
    hoaName: string
    hoaAddress: string
    hoaCity: string
    hoaState: string
    hoaZip: string
  }>(
    `SELECT o.id, o.first_name, o.last_name, o.email, o.phone, o.role, o.unit_id,
            h.name AS hoa_name, h.address AS hoa_address,
            h.city AS hoa_city, h.state AS hoa_state, h.zip AS hoa_zip
     FROM owners o
     JOIN hoas h ON h.id = o.hoa_id
     WHERE o.cognito_sub = :userId AND o.hoa_id = :hoaId`,
    [param.string('userId', userId), param.string('hoaId', hoaId)],
  )

  // Owner not found at all
  if (!ownerRow) return null

  // If the owner has no unit (e.g. board_admin), return profile + HOA data, no unit/assessments
  if (!ownerRow.unitId) {
    return {
      owner: {
        id: ownerRow.id,
        firstName: ownerRow.firstName,
        lastName: ownerRow.lastName,
        email: ownerRow.email,
        phone: ownerRow.phone,
        role: ownerRow.role,
        unitId: null,
      },
      unit: null,
      assessments: [],
      hoaName: ownerRow.hoaName,
      hoaAddress: ownerRow.hoaAddress,
      hoaCity: ownerRow.hoaCity,
      hoaState: ownerRow.hoaState,
      hoaZip: ownerRow.hoaZip,
    }
  }

  const unit = await queryOne<Record<string, unknown>>(
    `SELECT u.id, u.unit_number, u.address, u.sqft, u.bedrooms, u.bathrooms
     FROM units u
     WHERE u.id = :unitId AND u.hoa_id = :hoaId`,
    [param.string('unitId', ownerRow.unitId), param.string('hoaId', hoaId)],
  )

  const assessments = unit
    ? await query<Record<string, unknown>>(
        `SELECT id, amount, due_date, paid_date, status, description, created_at
         FROM assessments
         WHERE unit_id = :unitId
         ORDER BY due_date DESC
         LIMIT 12`,
        [param.string('unitId', ownerRow.unitId)],
      )
    : []

  return {
    owner: {
      id: ownerRow.id,
      firstName: ownerRow.firstName,
      lastName: ownerRow.lastName,
      email: ownerRow.email,
      phone: ownerRow.phone,
      role: ownerRow.role,
      unitId: ownerRow.unitId,
    },
    unit: unit ?? null,
    assessments,
    hoaName: ownerRow.hoaName,
    hoaAddress: ownerRow.hoaAddress,
    hoaCity: ownerRow.hoaCity,
    hoaState: ownerRow.hoaState,
    hoaZip: ownerRow.hoaZip,
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
  SELECT o.id, o.hoa_id AS "hoaId", o.email, o.first_name AS "firstName", o.last_name AS "lastName",
         o.role, o.status, o.unit_id AS "unitId", u.unit_number AS "unitNumber",
         o.phone, o.avatar_url AS "avatarUrl", o.last_seen_at AS "lastSeenAt",
         o.joined_via_code AS "joinedViaCode", o.created_at AS "createdAt", o.updated_at AS "updatedAt"
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

// ── HOA Admin — Members ──────────────────────────────────────────────────────

export interface Member {
  id: string
  hoaId: string
  email: string
  firstName: string
  lastName: string
  role: string
  status: string
  unitId: string | null
  unitNumber: string | null
  phone: string | null
  lastSeenAt: string | null
  joinedViaCode: string | null
  createdAt: string
}

export async function listMembers(hoaId: string, status?: string): Promise<Member[]> {
  const params = [param.string('hoaId', hoaId)]
  let sql = `${RESIDENT_SELECT} WHERE o.hoa_id = :hoaId`
  if (status) {
    sql += ` AND o.status = :status`
    params.push(param.string('status', status))
  }
  sql += ` ORDER BY
    CASE o.status WHEN 'pending' THEN 0 WHEN 'active' THEN 1 ELSE 2 END,
    o.last_name ASC, o.first_name ASC`
  return query<Member>(sql, params)
}

export async function updateMemberStatus(
  hoaId: string,
  memberId: string,
  status: 'active' | 'suspended',
): Promise<Member | null> {
  await execute(
    `UPDATE owners SET status = :status, updated_at = NOW()
     WHERE id = :memberId AND hoa_id = :hoaId`,
    [param.string('status', status), param.string('memberId', memberId), param.string('hoaId', hoaId)],
  )
  return getResident(hoaId, memberId)
}

export async function logMembershipEvent(input: {
  hoaId: string
  ownerId: string
  eventType: 'applied' | 'approved' | 'rejected' | 'suspended' | 'reinstated'
  performedBy: string | null
  notes: string | null
}): Promise<void> {
  await execute(
    `INSERT INTO membership_events (id, hoa_id, owner_id, event_type, performed_by, notes)
     VALUES (gen_random_uuid(), :hoaId, :ownerId, :eventType, :performedBy, :notes)`,
    [
      param.string('hoaId', input.hoaId),
      param.string('ownerId', input.ownerId),
      param.string('eventType', input.eventType),
      param.stringOrNull('performedBy', input.performedBy),
      param.stringOrNull('notes', input.notes),
    ],
  )
}

// ── HOA Admin — Stats ────────────────────────────────────────────────────────

export interface HoaStats {
  totalMembers: number
  activeMembers: number
  pendingMembers: number
  suspendedMembers: number
  totalUnits: number
  occupiedUnits: number
  openMaintenanceRequests: number
  urgentMaintenanceRequests: number
  overdueAssessments: number
  recentActivityCount: number
}

export async function getHoaStats(hoaId: string): Promise<HoaStats> {
  const [memberStats, unitStats, maintenanceStats, assessmentStats, activityStats] = await Promise.all([
    queryOne<{ total: number; active: number; pending: number; suspended: number }>(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE status = 'active')::int AS active,
         COUNT(*) FILTER (WHERE status = 'pending')::int AS pending,
         COUNT(*) FILTER (WHERE status = 'suspended')::int AS suspended
       FROM owners WHERE hoa_id = :hoaId`,
      [param.string('hoaId', hoaId)],
    ),
    queryOne<{ total: number; occupied: number }>(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(DISTINCT o.unit_id)::int AS occupied
       FROM units u
       LEFT JOIN owners o ON o.unit_id = u.id AND o.hoa_id = u.hoa_id
       WHERE u.hoa_id = :hoaId`,
      [param.string('hoaId', hoaId)],
    ),
    queryOne<{ open: number; urgent: number }>(
      `SELECT
         COUNT(*) FILTER (WHERE status IN ('open','in_progress'))::int AS open,
         COUNT(*) FILTER (WHERE status IN ('open','in_progress') AND priority = 'urgent')::int AS urgent
       FROM maintenance_requests WHERE hoa_id = :hoaId`,
      [param.string('hoaId', hoaId)],
    ),
    queryOne<{ overdue: number }>(
      `SELECT COUNT(*)::int AS overdue
       FROM assessments
       WHERE hoa_id = :hoaId AND status IN ('outstanding','overdue') AND due_date < NOW()`,
      [param.string('hoaId', hoaId)],
    ),
    queryOne<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM user_activity_log
       WHERE hoa_id = :hoaId AND created_at > NOW() - INTERVAL '7 days'`,
      [param.string('hoaId', hoaId)],
    ),
  ])

  return {
    totalMembers: memberStats?.total ?? 0,
    activeMembers: memberStats?.active ?? 0,
    pendingMembers: memberStats?.pending ?? 0,
    suspendedMembers: memberStats?.suspended ?? 0,
    totalUnits: unitStats?.total ?? 0,
    occupiedUnits: unitStats?.occupied ?? 0,
    openMaintenanceRequests: maintenanceStats?.open ?? 0,
    urgentMaintenanceRequests: maintenanceStats?.urgent ?? 0,
    overdueAssessments: assessmentStats?.overdue ?? 0,
    recentActivityCount: activityStats?.count ?? 0,
  }
}

// ── HOA Admin — Invite Codes ─────────────────────────────────────────────────

export interface InviteCodeRecord {
  id: string
  hoaId: string
  code: string
  usedCount: number
  maxUses: number | null
  expiresAt: string | null
  isActive: boolean
  createdAt: string
}

export async function getHoaInviteCode(hoaId: string): Promise<InviteCodeRecord | null> {
  return queryOne<InviteCodeRecord>(
    `SELECT id, hoa_id AS "hoaId", code, used_count AS "usedCount",
            max_uses AS "maxUses", expires_at AS "expiresAt",
            is_active AS "isActive", created_at AS "createdAt"
     FROM invite_codes
     WHERE hoa_id = :hoaId AND is_active = true
     ORDER BY created_at DESC
     LIMIT 1`,
    [param.string('hoaId', hoaId)],
  )
}

export async function rotateHoaInviteCode(input: {
  hoaId: string
  createdBy: string
  maxUses: number | null
  expiresAt: string | null
}): Promise<InviteCodeRecord> {
  // Deactivate existing codes
  await execute(
    'UPDATE invite_codes SET is_active = false WHERE hoa_id = :hoaId AND is_active = true',
    [param.string('hoaId', input.hoaId)],
  )

  const code = Array.from({ length: 8 }, () =>
    'ABCDEFGHIJKLMNPQRSTUVWXYZ123456789'[Math.floor(Math.random() * 34)],
  ).join('')

  const row = await queryOne<{ id: string }>(
    `INSERT INTO invite_codes (id, hoa_id, code, created_by, max_uses, expires_at, is_active, used_count)
     VALUES (gen_random_uuid(), :hoaId, :code, :createdBy, :maxUses, :expiresAt, true, 0)
     RETURNING id`,
    [
      param.string('hoaId', input.hoaId),
      param.string('code', code),
      param.string('createdBy', input.createdBy),
      param.stringOrNull('maxUses', input.maxUses != null ? String(input.maxUses) : null),
      param.stringOrNull('expiresAt', input.expiresAt),
    ],
  )
  if (!row?.id) throw new Error('Failed to create invite code')

  const created = await getHoaInviteCode(input.hoaId)
  if (!created) throw new Error('Failed to retrieve created invite code')
  return created
}

// ── Activity Log ─────────────────────────────────────────────────────────────

export interface ActivityEntry {
  id: string
  hoaId: string
  ownerId: string | null
  actorName: string
  action: string
  metadata: Record<string, unknown> | null
  createdAt: string
}

export async function logActivity(
  hoaId: string,
  ownerId: string | null,
  action: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  await execute(
    `INSERT INTO user_activity_log (id, hoa_id, owner_id, action, metadata, created_at)
     VALUES (gen_random_uuid(), :hoaId, :ownerId, :action, :metadata, NOW())`,
    [
      param.string('hoaId', hoaId),
      param.stringOrNull('ownerId', ownerId),
      param.string('action', action),
      param.stringOrNull('metadata', metadata ? JSON.stringify(metadata) : null),
    ],
  )
}

export async function getActivityLog(hoaId: string, limit: number, offset: number): Promise<ActivityEntry[]> {
  return query<ActivityEntry>(
    `SELECT al.id, al.hoa_id AS "hoaId", al.owner_id AS "ownerId",
            COALESCE(CONCAT(o.first_name, ' ', o.last_name), 'System') AS "actorName",
            al.action,
            al.metadata,
            al.created_at AS "createdAt"
     FROM user_activity_log al
     LEFT JOIN owners o ON o.id = al.owner_id
     WHERE al.hoa_id = :hoaId
     ORDER BY al.created_at DESC
     LIMIT :limit OFFSET :offset`,
    [
      param.string('hoaId', hoaId),
      param.string('limit', String(limit)),
      param.string('offset', String(offset)),
    ],
  )
}
