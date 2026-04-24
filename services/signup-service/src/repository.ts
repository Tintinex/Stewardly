import { queryOne, param } from '../../shared/db/client'
import type { InviteValidation } from './types'

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
