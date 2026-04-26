import { queryOne, execute, param } from '../../shared/db/client'
import type { InviteValidation } from './types'

// ── Invite code validation ────────────────────────────────────────────────────

export async function validateInviteCode(code: string): Promise<InviteValidation> {
  const row = await queryOne<{ hoaId: string; hoaName: string }>(
    `SELECT ic.hoa_id, h.name AS hoa_name
     FROM invite_codes ic
     JOIN hoas h ON h.id = ic.hoa_id
     WHERE ic.code = :code
       AND ic.is_active = TRUE
       AND (ic.expires_at IS NULL OR ic.expires_at > NOW())
       AND (ic.max_uses IS NULL OR ic.used_count < ic.max_uses)`,
    [param.string('code', code)],
  )

  if (!row) {
    return { valid: false, hoaId: '', hoaName: '', message: 'Invalid or expired invite code' }
  }

  return { valid: true, hoaId: row.hoaId, hoaName: row.hoaName }
}

// ── HOA self-registration ─────────────────────────────────────────────────────

export async function createHoa(input: {
  name: string
  address: string
  city: string
  state: string
  zip: string
  unitCount: number
}): Promise<{ id: string; name: string }> {
  const row = await queryOne<{ id: string; name: string }>(
    `INSERT INTO hoas (id, name, address, city, state, zip, unit_count)
     VALUES (gen_random_uuid(), :name, :address, :city, :state, :zip, :unitCount)
     RETURNING id, name`,
    [
      param.string('name', input.name),
      param.string('address', input.address),
      param.string('city', input.city),
      param.string('state', input.state),
      param.string('zip', input.zip),
      param.int('unitCount', input.unitCount),
    ],
  )
  if (!row) throw new Error('Failed to create HOA')
  return row
}

export async function createSubscription(hoaId: string): Promise<void> {
  await execute(
    `INSERT INTO subscriptions (id, hoa_id, tier, status, trial_ends_at)
     VALUES (gen_random_uuid(), :hoaId, 'starter', 'trialing', NOW() + INTERVAL '14 days')`,
    [param.string('hoaId', hoaId)],
  )
}

export async function createBoardAdminOwner(input: {
  hoaId: string
  email: string
  firstName: string
  lastName: string
  phone: string | null
  cognitoSub?: string
}): Promise<{ id: string; email: string; firstName: string; lastName: string; role: string }> {
  const row = await queryOne<{ id: string; email: string; firstName: string; lastName: string; role: string }>(
    `INSERT INTO owners
       (id, hoa_id, email, first_name, last_name, role, status, phone, cognito_sub)
     VALUES
       (gen_random_uuid(), :hoaId, :email, :firstName, :lastName,
        'board_admin', 'active', :phone, :cognitoSub)
     RETURNING id, email, first_name AS "firstName", last_name AS "lastName", role`,
    [
      param.string('hoaId', input.hoaId),
      param.string('email', input.email),
      param.string('firstName', input.firstName),
      param.string('lastName', input.lastName),
      param.stringOrNull('phone', input.phone),
      param.stringOrNull('cognitoSub', input.cognitoSub ?? null),
    ],
  )
  if (!row) throw new Error('Failed to create board admin owner record')
  return row
}

export async function createInitialInviteCode(hoaId: string, adminOwnerId: string): Promise<string> {
  const row = await queryOne<{ code: string }>(
    `INSERT INTO invite_codes (id, hoa_id, code, created_by, is_active)
     VALUES (
       gen_random_uuid(),
       :hoaId,
       SUBSTR(UPPER(REPLACE(gen_random_uuid()::text, '-', '')), 1, 8),
       :adminOwnerId,
       TRUE
     )
     RETURNING code`,
    [
      param.string('hoaId', hoaId),
      param.string('adminOwnerId', adminOwnerId),
    ],
  )
  if (!row) throw new Error('Failed to create invite code')
  return row.code
}
