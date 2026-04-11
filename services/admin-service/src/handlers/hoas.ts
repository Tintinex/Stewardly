import * as r from '../../../shared/response'
import { listHoas, getHoa, updateHoa, writeAuditLog } from '../repository'
import type { UpdateHoaInput } from '../types'

export async function handleListHoas(): Promise<r.ApiResponse> {
  const hoas = await listHoas()
  return r.ok(hoas)
}

export async function handleGetHoa(hoaId: string): Promise<r.ApiResponse> {
  const hoa = await getHoa(hoaId)
  if (!hoa) return r.notFound('HOA')
  return r.ok(hoa)
}

export async function handleUpdateHoa(
  hoaId: string,
  body: string | null,
  adminUserId: string,
): Promise<r.ApiResponse> {
  if (!body) return r.badRequest('Request body required')

  let input: UpdateHoaInput
  try {
    input = JSON.parse(body) as UpdateHoaInput
  } catch {
    return r.badRequest('Invalid JSON')
  }

  const updated = await updateHoa(hoaId, input)
  if (!updated) return r.notFound('HOA')

  await writeAuditLog(adminUserId, 'UPDATE_HOA', 'hoa', hoaId, input)
  return r.ok(updated)
}
